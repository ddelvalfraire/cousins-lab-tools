use std::collections::HashMap;
use std::any::Any;

pub fn test() {
    println!("Hello from the library!");
}

pub struct DataFrame {
    channels: HashMap<String, Box<dyn Any>>
}

impl DataFrame {
    pub fn new() -> DataFrame {
        DataFrame {
            channels: HashMap::new()
        }
    }

    pub fn add_channel(&mut self, channel_name: String, data: Box<dyn Any>) {
        self.channels.insert(channel_name, data);
    }
}

pub struct PipeFilterEngine {
    swap: SwapBuffer<String>
}

impl PipeFilterEngine {

    pub fn new() -> PipeFilterEngine {
        PipeFilterEngine {
            swap: SwapBuffer {
                current: String::new(),
                next: String::new(),
            }
        }
    }
    pub fn test(&mut self) {
        println!("Pipe filter engine!");
        self.swap.current = "current!".to_string();
        self.swap.next = "next!".to_string();
        println!("swap.current is {}, swap.next is {}", self.swap.current, self.swap.next);
        println!("swapping!");
        self.swap.swap();
        println!("swap.current is {}, swap.next is {}", self.swap.current, self.swap.next);
    }
}

struct SwapBuffer<T> {
    current: T,
    next: T
}

impl<T> SwapBuffer<T> {
    fn swap(&mut self) {
        std::mem::swap(&mut self.current, &mut self.next)
    }
}
