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

    pub fn channel(&self, channel_name: &str) -> Option<&Box<dyn Any>> {
        self.channels.get(channel_name)
    }
}

pub struct Packet {
    dest_comp: ComponentID,
    dest_port: Port,
    frame: DataFrame,
}

pub struct PipeFilterEngine {
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
