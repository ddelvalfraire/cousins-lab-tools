mod swap_buffer;

use std::collections::{HashMap, HashSet, VecDeque};
use std::any::Any;
use crate::swap_buffer::SwapBuffer;

pub fn test() {
    println!("Hello from the library!");
}

pub struct DataFrame {
    channels: HashMap<String, Box<dyn Any>>
}

// Ports currently only contain string names, this may change later
pub struct Port {
    name: String,
}

#[derive(Eq, Hash, PartialEq)]
pub struct ComponentID(u32);

// This struct will contain whatever we end up using to let a Component access the DataFrames at its ports.
pub struct Context {

}

pub enum RunMode {
    Ticked, // Component::process() called every tick
    Sensitive, // Component::process() called every time data is available, bypassing tick buffer.
    TickedSensitive, // Component::process() called every tick and when data is available
    Passive,
}

pub trait Component {
    fn in_ports(&self) -> Vec<Port>;
    fn out_ports(&self) -> Vec<Port>;
    fn config_port(&self) -> Option<Port>;

    fn run_mode(&self) -> RunMode;

    fn process (&mut self, context: Context);
}

// A factory for producing components.
pub trait CompFactory {
    /* Returns an identifying type name of the component - used during deserialization to determine which factory to use. */
    fn name() -> String;

    /* Default factory method*/
    fn new_component() -> Option<Box<dyn Component>>;
}

// A factory that accepts a configuration struct and produces a component
pub trait ConfigCompFactory: CompFactory {
    type Config: Any + Default + 'static;
    fn new_config_component(config: Self::Config) -> Option<Box<dyn Component>>;
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
    last_id: u32,

    tick_buffer: SwapBuffer<HashMap<ComponentID, VecDeque<Packet>>>,
    components: HashMap<ComponentID, Box<dyn Component>>,
    sensitive_comps: HashSet<ComponentID>,
}

impl PipeFilterEngine {
    pub fn new() -> PipeFilterEngine {
        PipeFilterEngine {
            last_id: 0,

            tick_buffer: SwapBuffer {
                current: HashMap::new(),
                next: HashMap::new(),
            },
            components: HashMap::new(),
            sensitive_comps: HashSet::new(),
        }
    }

    pub fn add_component(&mut self, component: Box<dyn Component +'static>) -> ComponentID {
        let this_id = self.last_id + 1;
        match component.run_mode() {
            RunMode::Sensitive => {
                self.sensitive_comps.insert(ComponentID(this_id));
            },
            _ => {},
        }

        // Some additional processing involving ports might need to happen here.

        self.components.insert(ComponentID(this_id), component);

        self.last_id = this_id;
        ComponentID(this_id)
    }
}
