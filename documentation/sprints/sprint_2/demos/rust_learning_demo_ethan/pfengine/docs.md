# Prototype Pipe-and-Filter engine design
## Introduction

The author of this document (@Inventor4life) has very little Rust experience at the time of writing, so most of this document will be purely conceptual during the early development of this engine.

This document assumes the reader has a minimum level of familiarity with Pipe-and-Filter models, mainly the following ideas:
 - "Sources": Produce raw data. Ex: temperature sensor readings.
 - "Filters": Accept data and perform calculations/filtrations on it, outputting the transformed data. Ex: Downsampling, accepting temperature sensor readings and taking the derivative with respect to time, or only passing data values above a set threshold.
 - "Sinks": Accept data and extract it from the Pipe-and-Filter engine - this could be to a file, stdio, UI, etc.
 - "Pipes" move data between sources, filters, and sinks.

## General usage
Pipe-and-Filter models are generally used to process or perform consistent transformations on data. Once a Pipe-and-Filter model is in place to perform a set of data transformations, it should be able to perform those transformations consistently on arbitrarily large data sets. 

The Pipe-and-Filter engine is the software library this documentation is for, which allows you to create, run, and load arbitrary Pipe-and-Filter models. In order to make the engine as extensible as possible, some abstractions have been made to the base pipe and filter concept.

## Abstractions
### No "Source", "Sink", "Filters" - Only "Ports" and "Components"
Sources, Sinks, and Filters will collectively be referred to and abstracted as "Components". A Component is any piece in the Pipe-and-Filter model that produces, consumes, or modifies data. A Component may have one or more Ports through which it can interact with other Components, and Ports come in two types: inPorts that consume data, and outPorts that produce data. Traditional Components can be represented through a combination of these Ports: a Source is a Component with only outPorts, a Sink is a Component with only inPorts, and Filters are a combination of inPorts and outPorts. This is done because the engine has no need to differentiate between Sources, Sinks, or Filters. It also gives the advantage that Components in a future version of the engine may be able to change their port layouts at runtime if necessary.

## Data Encapsulation
This engine is written in Rust, which has a few side effects. The following information may not be correct, but is believed to be true by the author:
 - Rust has no way to take an arbitrary object and deduce its type at runtime
 - Rust has no way to take an arbitrary object and confirm if it has a given field or implements particular traits.
 - Rust has no way to take an arbitrary string (such as "u32") and interpret it as a type name.

This presents a challenge because users should be able to implement and use their own custom data structures, and library Components should be able to handle specific kinds of structures while ignoring structures they cannot parse. The current working solution to this is as follows:
```
struct Schema {
  type_map: HashMap<TypeID, Vec<String>>
  channel_map: HashMap<String, TypeID>>
}

struct DataFrame {
  schema: Arc<Schema>
  channels: HashMap<String, Box<dyn Any + Send + Sync>>
}
```

The Pipe and Filter engine passes DataFrames between connected Ports. When a Component receives a DataFrame, it can parse it using the following tools:
 - Each DataFrame contains a `channels` HashMap that turns a channel name (such as `Oxygen_percentage`) into an associated value of an unknown data type.
 - The Schema `channel_map` field can be used to get the appropriate type (`float`) contained by a channel.
 - If the Component wishes to operate on all channels of a given type, it can use the Schema `type_map` field to get all channel names of that type.
 - Once the Component has both the arbitrary data and the TypeID, it can cast the fields it wishes to operate on into their respective types and then operate on them normally.
 - When the Component has finished its operations it packs the outputs into one or more DataFrames, generates (or references existing) Schemas for those DataFrames, and then passes them to an outPort to be routed by the engine. It is *extremely* important that Schemas match their associated DataFrames exactly. Channels without associated types cannot be operated on, types referencing nonexistant channels can cause lookup failures, and type/channel mismatches can cause program crashes or data corruption.

If a Component modifies types or channel names of an existing DataFrame before outputting it, it is highly recommended to clone the received DataFrame's Schema and modifying the new Schema concurrently with the DataFrame, such that the Schema matches the DataFrame at the end of any modification steps. This is because the DataFrame may contain channels other than the ones the Component operates on, and discarding the existing Schema will result in data loss.

## Data Extraction
TODO: Engine implements its own ports, so that we can interact with data outside the engine? E.g. engine.ports["inPort1"].push(*somedata*), engine.ports["outPort1"].pop()

## Execution Control and Routing
This portion is still in the very early stages of planning - the exact mechanism of transferring execution to a Component has not been decided, as Components can run arbitrary code and hence have arbitrary execution requirements. Here are a couple of factors still in consideration:
### Pushing data vs. Pulling data vs. Ticking vs. Hybrid?:
There are many different ways to dictate data and control flow between Components, with advantages and disadvantages to each:
 - Pushing: When a Component is finished processing and the data is ready to be sent to the next stage, it can "push" the data to the next Component. The next Component will immediately begins processing the data. Components only gain execution control if another Component pushes data to them. This works well when data becomes available at a rate slower than the engine normally processes it, so data is only processed as it becomes available.
 - Pulling: Similar to the above, but running in reverse. When a Component gets execution control, it can attempt to "pull" data from a prior Component. Execution transfers to that Component, which will either generate data and return or recursively pull from other prior Components until data is found. While very similar to Pushing, this works well in scenarios when we receive data faster than we can process it and the data can be either buffered or discarded.
 - Ticking: Every Component gets brief execution control when the engine is ticked. They can check if they have data waiting to be processed and process it if so, outputting DataFrames to the engine to be routed on the next Tick. This works well when we have arbitrary Components (which we do) that may require execution control as often as possible. The downside is that every Component gets ticked and will take up execution time, even if they have no data to process or otherwise do not need execution time outside of processing available data. The other downside is that data may not be processed immediately. Suppose we have a Component taking measurements (in millivolts), producing DataFrames, and then sending them to another Component that adds a channel with the current time (in microseconds) to the DataFrame. This time is meant to represent the time that the sample was taken, and as such should be reasonably accurate. If every Component gets ticked rather than just necessary ones, there may be a significant delay between a sample being recorded and it being assigned a sample time. 
 - Hybrid (WIP): Components can register (upon creation) some form of execution preference - either ticked, ticked-sensitive, sensitive, or passive. "Ticked" Components will get execution control at some point during every engine tick, regardless of whether they have data to consume. "Sensitive" Components will be given execution control *immediately* after data becomes available to them, so that time-sensitive transformations are not blocked by other Components. "Ticked-Sensitive" components combine both ticking and sensitive properties, where a Component is executed immediately if it has available data, in addition to being executed once per engine tick. "Passive" Components are only given execution control when they have data to process, and are otherwise ignored. [1][2]

### Should we allow Components to delay accepting DataFrames?
In short, yes. Suppose that we have a Component called the "Merger" with two inPorts: "A" and "B". This Component's job is to join a single DataFrame from "A" with a single DataFrame from "B", and only process them in pairs (every DataFrame from a given inPort MUST be combined with a DataFrame from the other inPort). If we force Components to accept DataFrames and the "B" port is receiving DataFrames at a rate much slower than the "A" port, then the Merger will be forced to have an unbound internal buffer to store unpaired DataFrames or start dropping frames. Unless the Merger has a way to communicate with the engine that its internal buffer is filling up, the engine will never know that frames are being unintentionally dropped. If we allow Components to poll whether ports have available DataFrames rather than forcing the frames into the Component, the engine can track when a Component is stalled by looking at its DataFrame queue. By extension, whatever method we use to transfer control to a Component (like an `onTick` or `process` function) should *not* pass DataFrames to the Component

### How to handle port discrimination?
Suppose we have a Component with two inPorts: "A" and "B". We've established in the previous section that we must have a method for Components to poll their ports for available DataFrames, e.g. `doesPortHaveData(PortID)`. In addition, we should inform Components which port(s) have data when transferring execution. Otherwise, the first step for Components will likely be to poll every available port for data.

We shouldn't force Components to implement handler functions like `handlePortA(DataFrame)`, as this will present significant design challenges in cases where DataFrames from multiple ports are used together. Instead we should implement a way to let Components accept DataFrames from their ports like a queue or a `getPortData(PortID)` function. If they then choose to pass DataFrames to their own handlers, more power to them. The point is to not establish restrictions on how Components must operate, so that Components can perform essentially any task that may be required.

### When ticking, do we implement tick-buffers?
When the engine is ticked, it in turns ticks every ticked Component. These Components produce DataFrames, which are then routed to other Components. Sensitive Components will bypass any buffer and receive their frames immediately. What about passive components? Suppose we have a source Component "Sender" connected to a passive component "Receiver1" connected to another passive component "Receiver2". When Sender is ticked and produces data, does Receiver1 get triggered within the same tick? Suppose Receiver1 is triggered and produces data, does Receiver2 get triggered within the same tick? Suppose we have a chain of 1000 Receivers wired end-to-end, does a single tick trigger all 1000 sequentially? Or do we implement a buffer where DataFrames produced on the current tick are queued to be processed on the next tick? A tick buffer will cause each tick to take less processing time, but will require more ticks to fully process data. It will also allow data to be processed in parallel, since each Component is processing data from only the component immediately prior. Finally, ticking will represent a quantum step of DataFrames from one component to the next, which can be looped to simulate the effect of not having a tick buffer (e.g. an `engine.run()` method). Without a tick buffer, Receivers wired in a loop may stall the engine forever. Without a tick buffer, ticking the engine will process a single unit of data from start-to-finish every time, unless DataFrames are dropped.

### Notes:
 [1] I was concerned about an edge case where a source Component pushes multiple DataFrames at once to a sensitive Component. Do we interrupt the source Component so the sensitive one may process data? Do we wait for the source Component to finish and then have the sensitive Component process in a batch? My thoughts are that our time-tagging Component will give a bunch of DataFrames the exact same timestamp if they are batched, even if they arrived at different times - thus we should interrupt source Components if they are pushing to a sensitive component, but let source components batch DataFrames if they are being pushed to a passive component.
 
 [2] Another edge case. Consider this: a sensitive Component gets execution control but does not take its DataFrame (like or Merger example, where it is waiting for input on another port). Execution returns to the source Component. The source Component produces another DataFrame onto the same port within the same tick. Do we execute the sensitive Component again? On one hand if the source is pushing 1,000 frames then the sensitive Component will get executed (and do nothing) 1,000 times. On the other hand, what if the sensitive Component needs multiple DataFrames in queue on one port before processing them? Should we even allow Components to know how many frames are in their queue?

## Arbitrary Components
TODO: Explain how the engine can use arbitrary components - how are ports stored such that the engine can find and use an arbitrary number of them? Port vector? Registration function? Reiterate that a component can run nearly *any* code.

## Configuring the Engine
TODO: Configure components + connections in code or load an existing configuration using serde.

## Static Component Configuration
TODO: Component factories - create configured components and transfer to engine, or use serde.

## Live Component Configuration
TODO: Dedicated configuration ports, still using DataFrames? Potentially using componentIDs as channel names, so different instances of the same component can be configured separately.

## Component Statuses and Stopping the Engine
TODO: Hard engine stop (drop all DataFrames, exit immediately), soft engine stop (send stop command to Components, continue to tick until every Component has a "stopped" status, how do passive components decide their status?). How to make nested component statuses for asynchronous components?

## Asynchronous Components
TODO: Because components can run arbitrary code, we can create a "wrapper" component that runs its own pipe-and-filter engine in a separate thread. Because we can configure the engine from code or from serialized data, we can create a configuration of components called an "assembly", instantiate our asynchronous wrapper, pass the configuration to the wrapper (which instantiates our Components in the sub-engine on their own thread), and then buffer data going into and out of the subengine using thread-safe queues (Tokio library?). Every component may assume and behave as if it were single-threaded within the engine. How to pass statuses of components from sub engine to main engine?

## Component Error Handling and Logging
TODO
