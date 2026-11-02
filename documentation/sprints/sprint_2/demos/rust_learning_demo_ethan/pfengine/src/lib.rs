use std::collections::HashMap;
mod swap_buffer;
use std::any::Any;
use crate::swap_buffer::SwapBuffer;

pub fn test() {
    println!("Hello from the library!");
}

pub struct DataFrame {
    channels: HashMap<String, Box<dyn Any>>
}

// Ports currently only contain string names, this may change later
struct Port {
    name: String,
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
