#![allow(dead_code)]

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cousinslab::contract::{Event, Row, Sink};

/// Records every `rows` call as one batch, shared with the test thread while a run is going.
#[derive(Clone, Default)]
pub struct CollectingSink {
    pub batches: Arc<Mutex<Vec<Vec<Row>>>>,
    pub events: Arc<Mutex<Vec<Event>>>,
}

impl CollectingSink {
    pub fn row_count(&self) -> usize {
        self.batches.lock().unwrap().iter().map(Vec::len).sum()
    }

    pub fn batches(&self) -> Vec<Vec<Row>> {
        self.batches.lock().unwrap().clone()
    }

    pub fn events(&self) -> Vec<Event> {
        self.events.lock().unwrap().clone()
    }
}

impl Sink for CollectingSink {
    fn rows(&mut self, rows: Vec<Row>) {
        self.batches.lock().unwrap().push(rows);
    }

    fn event(&mut self, event: Event) {
        self.events.lock().unwrap().push(event);
    }
}

pub fn wait_until(what: &str, mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !done() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        thread::sleep(Duration::from_millis(5));
    }
}
