//! Writes a simulated EZView spool so the spool adapter can run without the instrument.
//!
//! The values come from a recording; the timestamps are this machine's clock at write time.
//! The line layout follows what readEZView.py parses. No real spool file has been checked
//! against it yet, so the trailing timestamp digits and line splitting are assumptions.

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use chrono::{Local, NaiveDateTime};

use crate::contract::{InstrumentError, StopSignal};
use crate::pycompat::{float_repr, os_error};
use crate::schemas::{CHANNEL_RANGES, FULL_SCALE_COUNTS};
use crate::spool::TERMINATOR;

pub const FIRST_LINE_HEX_CHARS: usize = 56;

/// Values keyed by channel 1..=12. Channels left out are written as zero counts.
pub type ChannelValues = BTreeMap<usize, f64>;

/// The word the decoder turns back into `value`, refused when its first hex digit is needed.
pub fn encode_counts(channel: usize, value: f64) -> Result<i64, InstrumentError> {
    let scale = channel
        .checked_sub(1)
        .and_then(|i| CHANNEL_RANGES.get(i).copied().flatten())
        .ok_or_else(|| {
            InstrumentError::new("AssertionError", format!("ch{channel} is not decoded"))
        })?;
    let counts = (value / scale * FULL_SCALE_COUNTS as f64).round_ties_even();
    if !(0.0..(1u32 << 28) as f64).contains(&counts) {
        return Err(InstrumentError::new(
            "ValueError",
            format!(
                "ch{channel}={} cannot be represented: the decoder zeroes the first hex digit",
                float_repr(value)
            ),
        ));
    }
    Ok(counts as i64)
}

/// Twelve words, the gain field, and the terminator, as one hex string.
pub fn encode_frame(values: &ChannelValues, gain: &str) -> Result<String, InstrumentError> {
    let mut hex = String::with_capacity(108);
    for channel in 1..=12 {
        let counts = match values.get(&channel) {
            Some(&value) => encode_counts(channel, value)?,
            None => 0,
        };
        hex.push_str(&format!("{counts:08x}"));
    }
    Ok(format!("{hex}0{gain}{TERMINATOR}"))
}

/// A frame split over two lines with the same stamp, microseconds followed by `0000`.
pub fn spool_lines(when: NaiveDateTime, frame_hex: &str) -> String {
    let stamp = format!("{}0000", when.format("%m/%d/%y %H:%M:%S%.6f"));
    let (head, tail) = frame_hex.split_at(FIRST_LINE_HEX_CHARS.min(frame_hex.len()));
    format!("{stamp}\t{head}\n{stamp}\t{tail}\n")
}

/// One recorded frame: seconds on the recording's clock and the values to write.
#[derive(Clone, Debug, PartialEq)]
pub struct SimulatedFrame {
    pub t_s: f64,
    pub values: ChannelValues,
}

/// Appends frames to `path` at the recording's own spacing divided by `speed`.
pub struct SpoolSimulator {
    path: PathBuf,
    frames: Arc<Vec<SimulatedFrame>>,
    speed: f64,
    stop: StopSignal,
    frames_written: Arc<AtomicUsize>,
    thread: Option<JoinHandle<Result<(), InstrumentError>>>,
}

impl SpoolSimulator {
    pub fn new(path: PathBuf, frames: Vec<SimulatedFrame>, speed: f64) -> Self {
        SpoolSimulator {
            path,
            frames: Arc::new(frames),
            speed,
            stop: StopSignal::default(),
            frames_written: Arc::default(),
            thread: None,
        }
    }

    /// Whether the writer thread is still going; it ends by itself after the last frame.
    pub fn is_running(&self) -> bool {
        self.thread.as_ref().is_some_and(|t| !t.is_finished())
    }

    pub fn frames_written(&self) -> usize {
        self.frames_written.load(Ordering::SeqCst)
    }

    /// Creates the spool file, so the adapter is ready, then starts writing on its own thread.
    pub fn start(&mut self) -> io::Result<()> {
        if self.thread.is_some() {
            return Ok(());
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let spool = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        let (frames, speed, stop, written, path) = (
            Arc::clone(&self.frames),
            self.speed,
            self.stop.clone(),
            Arc::clone(&self.frames_written),
            self.path.clone(),
        );
        self.thread = Some(
            thread::Builder::new()
                .name("ezview-simulator".into())
                .spawn(move || write_frames(spool, &frames, speed, &stop, &written, &path))?,
        );
        Ok(())
    }

    /// Stops writing and waits for the thread. Returns why the thread stopped early, if it did.
    pub fn close(&mut self) -> Result<(), InstrumentError> {
        self.stop.set();
        match self.thread.take() {
            Some(thread) => thread.join().unwrap_or_else(|_| {
                Err(InstrumentError::new("RuntimeError", "simulator panicked"))
            }),
            None => Ok(()),
        }
    }
}

impl Drop for SpoolSimulator {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

fn write_frames(
    mut spool: fs::File,
    frames: &[SimulatedFrame],
    speed: f64,
    stop: &StopSignal,
    written: &AtomicUsize,
    path: &Path,
) -> Result<(), InstrumentError> {
    let Some(first) = frames.first() else {
        return Ok(());
    };
    let mut previous = first.t_s;
    for frame in frames {
        let delay = (frame.t_s - previous) / speed;
        if stop.wait(Duration::try_from_secs_f64(delay.max(0.0)).unwrap_or(Duration::MAX)) {
            return Ok(());
        }
        previous = frame.t_s;
        let lines = spool_lines(
            Local::now().naive_local(),
            &encode_frame(&frame.values, "000")?,
        );
        spool
            .write_all(lines.as_bytes())
            .and_then(|()| spool.flush())
            .map_err(|e| os_error(&e, path))?;
        written.fetch_add(1, Ordering::SeqCst);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_the_decoder_cannot_produce_are_rejected() {
        let values = ChannelValues::from([(5, -404.404)]);
        assert_eq!(
            encode_frame(&values, "000").unwrap_err().to_string(),
            "ValueError: ch5=-404.404 cannot be represented: the decoder zeroes the first hex digit"
        );
        assert_eq!(
            encode_counts(9, 1.0).unwrap_err().to_string(),
            "AssertionError: ch9 is not decoded"
        );
        assert!(
            encode_counts(1, 0.2 * 1.2).is_err(),
            "needs a first hex digit"
        );
    }

    #[test]
    fn counts_round_half_to_even() {
        assert_eq!(encode_counts(5, 1.5 / FULL_SCALE_COUNTS as f64).unwrap(), 2);
        assert_eq!(encode_counts(5, 2.5 / FULL_SCALE_COUNTS as f64).unwrap(), 2);
    }
}
