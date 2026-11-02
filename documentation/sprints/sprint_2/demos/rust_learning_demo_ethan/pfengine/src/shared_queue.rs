use std::cell::RefCell;
use std::collections::VecDeque;
use std::rc::Rc;

type SharedQueue<T> = Rc<RefCell<VecDeque<T>>>;

pub struct Producer<T> {
    queue: SharedQueue<T>,
}

impl<T> Producer<T> {
    pub fn push(&self, item: T) {
        self.queue.borrow_mut().push_back(item);
    }
}

pub struct Consumer<T> {
    queue: SharedQueue<T>,
}

impl<T> Consumer<T> {
    pub fn pop(&mut self) -> Option<T> {
        self.queue.borrow_mut().pop_front()
    }
}

pub fn create_queue_pair<T>() -> (Producer<T>, Consumer<T>) {
    let shared_queue = Rc::new(RefCell::new(VecDeque::new()));
    (Producer {queue: shared_queue.clone()}, Consumer { queue: shared_queue })
}
