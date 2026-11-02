pub struct SwapBuffer<T> {
    pub current: T,
    pub next: T
}

impl<T> SwapBuffer<T> {
    pub fn swap(&mut self) {
        std::mem::swap(&mut self.current, &mut self.next)
    }
}
