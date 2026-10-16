//! EZView spool acquisition, decoded exactly as module1/application/read-data/readEZView.py does.
//!
//! EZView writes one text line per serial chunk: `<MM/DD/YY HH:MM:SS.fraction><TAB><hex>`.
//! A frame is the hex accumulated until it ends in `ffffffff`; the 100 hex characters before
//! the terminator hold twelve 32-bit words and a gain field. Each word's first hex digit is
//! forced to 0, then it is read as a big-endian int32 and scaled by `count / 234800968 * range`.
//!
//! Differences from the legacy reader, both deliberate:
//! - A frame split across the current end of file is kept and finished on the next poll.
//!   The legacy loop discarded it.
//! - Values are stored at full precision with the raw counts. The legacy CSV rounded to three
//!   decimals; [`legacy_frame_csv`] reproduces that rounding.

use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};

use crate::contract::{Cell, InstrumentError, Row};
use crate::pycompat::{float_repr, is_space, round, str_repr, strip};
use crate::schemas::{CHANNEL_RANGES, FULL_SCALE_COUNTS};

pub const TERMINATOR: &str = "ffffffff";
pub const TIMESTAMP_FORMAT: &str = "%m/%d/%y %H:%M:%S.%f";
pub const TIMESTAMP_TRAILING_CHARS: usize = 4;
const PAYLOAD_CHARS: usize = 100;

/// Channels in the column order of the legacy frame CSVs, after the time column, following the
/// drop and the two swaps in readEZView.py:102-117.
pub const LEGACY_FRAME_CHANNELS: [usize; 10] = [5, 2, 4, 3, 1, 6, 7, 8, 11, 12];

#[derive(Clone, Debug, PartialEq)]
pub struct SpoolFrame {
    pub source_time: NaiveDateTime,
    /// Words for channels 1..=12, first hex digit zeroed, so never negative.
    pub counts: [i64; 12],
    pub gain: String,
}

impl SpoolFrame {
    /// The scaled value of channel 1..=12, or `None` for the channels legacy does not decode.
    pub fn value(&self, channel: usize) -> Option<f64> {
        CHANNEL_RANGES[channel - 1]
            .map(|scale| self.counts[channel - 1] as f64 / FULL_SCALE_COUNTS as f64 * scale)
    }
}

/// Bytes read from a spool as text. EZView writes ASCII, and anything else is an error rather
/// than whatever the platform's default encoding would make of it.
pub fn decode_ascii(bytes: &[u8]) -> Result<&str, InstrumentError> {
    match bytes.iter().position(|b| !b.is_ascii()) {
        None => Ok(std::str::from_utf8(bytes).expect("ASCII is UTF-8")),
        Some(position) => Err(InstrumentError::new(
            "UnicodeDecodeError",
            format!(
                "'ascii' codec can't decode byte {:#04x} in position {position}: ordinal not in range(128)",
                bytes[position]
            ),
        )),
    }
}

/// A spool line's timestamp: the last 4 characters dropped, the rest read as
/// `%m/%d/%y %H:%M:%S.%f` the way Python's `strptime` reads it.
pub fn parse_timestamp(text: &str) -> Result<NaiveDateTime, InstrumentError> {
    let kept = text
        .char_indices()
        .rev()
        .nth(TIMESTAMP_TRAILING_CHARS - 1)
        .map_or("", |(end, _)| &text[..end]);
    let mismatch = || {
        InstrumentError::new(
            "ValueError",
            format!(
                "time data {} does not match format {}",
                str_repr(kept),
                str_repr(TIMESTAMP_FORMAT)
            ),
        )
    };
    let mut cursor = Cursor { text: kept, at: 0 };
    let fields = cursor.timestamp().ok_or_else(mismatch)?;
    if cursor.at < kept.len() {
        return Err(InstrumentError::new(
            "ValueError",
            format!("unconverted data remains: {}", &kept[cursor.at..]),
        ));
    }
    fields.to_datetime()
}

struct TimestampFields {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
    microsecond: u32,
}

impl TimestampFields {
    fn to_datetime(&self) -> Result<NaiveDateTime, InstrumentError> {
        let invalid = |message: &str| InstrumentError::new("ValueError", message);
        if self.second > 59 {
            return Err(invalid("second must be in 0..59"));
        }
        let date = NaiveDate::from_ymd_opt(self.year, self.month, self.day)
            .ok_or_else(|| invalid("day is out of range for month"))?;
        Ok(date
            .and_hms_micro_opt(self.hour, self.minute, self.second, self.microsecond)
            .expect("fields are in range"))
    }
}

/// Matches the regular expressions `_strptime` builds for each directive.
struct Cursor<'a> {
    text: &'a str,
    at: usize,
}

impl Cursor<'_> {
    fn timestamp(&mut self) -> Option<TimestampFields> {
        let month = self.number(1, 2).filter(|m| (1..=12).contains(m))?;
        self.literal(b'/')?;
        let day = self.day()?;
        self.literal(b'/')?;
        let year = self.number(2, 2)?;
        self.whitespace()?;
        let hour = self.number(1, 2).filter(|h| *h <= 23)?;
        self.literal(b':')?;
        let minute = self.number(1, 2).filter(|m| *m <= 59)?;
        self.literal(b':')?;
        let second = self.number(1, 2).filter(|s| *s <= 61)?;
        self.literal(b'.')?;
        let start = self.at;
        let fraction = self.number(1, 6)?;
        let microsecond = fraction * 10u32.pow((6 - (self.at - start)) as u32);
        let year = year as i32 + if year <= 68 { 2000 } else { 1900 };
        Some(TimestampFields {
            year,
            month,
            day,
            hour,
            minute,
            second,
            microsecond,
        })
    }

    fn day(&mut self) -> Option<u32> {
        if self.peek() == Some(b' ') {
            self.at += 1;
            return self.number(1, 1).filter(|d| *d >= 1);
        }
        self.number(1, 2).filter(|d| (1..=31).contains(d))
    }

    fn number(&mut self, min: usize, max: usize) -> Option<u32> {
        let digits = self.text.as_bytes()[self.at..]
            .iter()
            .take(max)
            .take_while(|b| b.is_ascii_digit())
            .count();
        if digits < min {
            return None;
        }
        let value = self.text[self.at..self.at + digits].parse().ok();
        self.at += digits;
        value
    }

    fn literal(&mut self, expected: u8) -> Option<()> {
        (self.peek() == Some(expected)).then(|| self.at += 1)
    }

    fn whitespace(&mut self) -> Option<()> {
        let spaces = self.text.as_bytes()[self.at..]
            .iter()
            .take_while(|b| is_space(char::from(**b)))
            .count();
        (spaces > 0).then(|| self.at += spaces)
    }

    fn peek(&self) -> Option<u8> {
        self.text.as_bytes().get(self.at).copied()
    }
}

/// The twelve words and the gain field of a 100-character payload.
pub fn decode_payload(payload: &str) -> Result<([i64; 12], String), InstrumentError> {
    let mut counts = [0; 12];
    for (k, count) in counts.iter_mut().enumerate() {
        let word = format!("0{}", &payload[8 * k + 1..8 * k + 8]);
        if let Some(position) = word.bytes().position(|b| !b.is_ascii_hexdigit()) {
            return Err(InstrumentError::new(
                "ValueError",
                format!("non-hexadecimal number found in fromhex() arg at position {position}"),
            ));
        }
        *count = i64::from_str_radix(&word, 16).expect("checked hex digits");
    }
    Ok((counts, format!("0{}", &payload[97..])))
}

/// Turns complete spool lines into frames, holding a partial frame between calls.
#[derive(Default)]
pub struct SpoolFramer {
    hex: String,
    time: Option<NaiveDateTime>,
}

impl SpoolFramer {
    pub fn feed(&mut self, line: &str) -> Result<Option<SpoolFrame>, InstrumentError> {
        let chunks: Vec<&str> = strip(line).split('\t').collect();
        if chunks.len() < 2 {
            return Ok(None);
        }
        if self.hex.is_empty() {
            self.time = Some(parse_timestamp(chunks[0])?);
        }
        self.hex.push_str(strip(chunks[1]));
        if !self.hex.ends_with(TERMINATOR) {
            return Ok(None);
        }
        let hex = std::mem::take(&mut self.hex);
        let time = self.time.take();
        let end = hex.len() - TERMINATOR.len();
        let payload = &hex[end.saturating_sub(PAYLOAD_CHARS)..end];
        let Some(source_time) = time.filter(|_| payload.len() == PAYLOAD_CHARS) else {
            return Ok(None);
        };
        let (counts, gain) = decode_payload(payload)?;
        Ok(Some(SpoolFrame {
            source_time,
            counts,
            gain,
        }))
    }
}

/// Every complete frame in a spool's text.
pub fn read_frames(text: &str) -> Result<Vec<SpoolFrame>, InstrumentError> {
    let mut framer = SpoolFramer::default();
    let mut frames = Vec::new();
    for line in text.split_inclusive('\n') {
        if let Some(frame) = framer.feed(line)? {
            frames.push(frame);
        }
    }
    Ok(frames)
}

/// Milliseconds from the adapter's start to the frame's timestamp, truncated toward zero as
/// `int(total_seconds() * 1000)` does in readEZView.py:76.
pub fn legacy_ms(source_time: NaiveDateTime, run_start_local: NaiveDateTime) -> i64 {
    let micros = (source_time - run_start_local)
        .num_microseconds()
        .expect("spool times are within a few centuries");
    (micros as f64 / 1e6 * 1000.0) as i64
}

/// A frame as a stored row, in the order of [`crate::schemas::spool_columns`].
pub fn frame_row(
    frame: &SpoolFrame,
    seq: i64,
    received: DateTime<Utc>,
    run_start_local: NaiveDateTime,
) -> Row {
    let mut row = vec![
        Cell::Int(seq),
        Cell::TimeUtc(received),
        Cell::TimeLocal(frame.source_time),
        Cell::Int(legacy_ms(frame.source_time, run_start_local)),
        Cell::Str(frame.gain.clone()),
    ];
    row.extend((1..=12).map(|ch| frame.value(ch).map_or(Cell::Null, Cell::Float)));
    row.extend(frame.counts.iter().map(|&count| Cell::Int(count)));
    row
}

/// One frame as the legacy reader wrote it: headerless, rounded to 3 decimals, LF ending.
///
/// pandas wrote the time column as a float ("1250.0") because it was concatenated onto an
/// empty frame; that is pandas-version behavior observed here, not a documented format.
pub fn legacy_frame_csv(frame: &SpoolFrame, t_legacy_ms: i64) -> String {
    let mut cells = vec![float_repr(t_legacy_ms as f64)];
    cells.extend(LEGACY_FRAME_CHANNELS.iter().map(|&ch| {
        let value = frame.value(ch).expect("legacy CSV channels are decoded");
        float_repr(round(value, 3))
    }));
    cells.join(",") + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(h: u32, m: u32, s: u32, micro: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, 30)
            .unwrap()
            .and_hms_micro_opt(h, m, s, micro)
            .unwrap()
    }

    #[test]
    fn timestamps_drop_four_trailing_digits_and_accept_short_fractions() {
        assert_eq!(
            parse_timestamp("09/30/26 09:00:01.2501370000").unwrap(),
            at(9, 0, 1, 250_137)
        );
        assert_eq!(
            parse_timestamp("9/30/26 9:0:1.51234").unwrap(),
            at(9, 0, 1, 500_000)
        );
        assert_eq!(
            parse_timestamp("02/ 3/99  23:59:59.0000000")
                .unwrap()
                .to_string(),
            "1999-02-03 23:59:59"
        );
    }

    #[test]
    fn malformed_timestamps_fail_with_the_python_messages() {
        let message = |text: &str| parse_timestamp(text).unwrap_err().to_string();
        assert_eq!(
            message("09/30/26 09:00:01.2501370000x"),
            "ValueError: unconverted data remains: 0"
        );
        assert_eq!(
            message("13/30/26 09:00:01.0000"),
            "ValueError: time data '13/30/26 09:00:01.' does not match format '%m/%d/%y %H:%M:%S.%f'"
        );
        assert_eq!(
            message("abc"),
            "ValueError: time data '' does not match format '%m/%d/%y %H:%M:%S.%f'"
        );
        assert_eq!(
            message("02/30/26 09:00:01.00000"),
            "ValueError: day is out of range for month"
        );
        assert_eq!(
            message("02/03/26 09:00:60.00000"),
            "ValueError: second must be in 0..59"
        );
    }

    #[test]
    fn payload_words_lose_their_first_hex_digit() {
        let payload = format!("f{}{}{}", "0000001", "0".repeat(88), "02a7");
        let (counts, gain) = decode_payload(&payload).unwrap();
        assert_eq!(counts[0], 1);
        assert_eq!(gain, "02a7");
        let bad = format!("0000000g{}", "0".repeat(92));
        assert_eq!(
            decode_payload(&bad).unwrap_err().message,
            "non-hexadecimal number found in fromhex() arg at position 7"
        );
    }

    #[test]
    fn frames_shorter_than_a_payload_are_dropped() {
        let mut framer = SpoolFramer::default();
        let line = "09/30/26 09:00:01.2501370000\t0123ffffffff\n";
        assert_eq!(framer.feed(line).unwrap(), None);
        assert_eq!(framer.feed("no tab here\n").unwrap(), None);
    }

    #[test]
    fn legacy_time_truncates_toward_zero() {
        let start = at(9, 0, 0, 0);
        assert_eq!(legacy_ms(at(9, 0, 1, 250_999), start), 1250);
        assert_eq!(legacy_ms(start, at(9, 0, 1, 250_999)), -1250);
    }

    #[test]
    fn non_ascii_bytes_are_rejected() {
        assert_eq!(
            decode_ascii(b"ok\xff").unwrap_err().to_string(),
            "UnicodeDecodeError: 'ascii' codec can't decode byte 0xff in position 2: ordinal not in range(128)"
        );
    }
}
