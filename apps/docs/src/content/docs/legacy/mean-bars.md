---
title: Select data with the mean bars
description: Use the two vertical mean bars to choose the section of data that a calculation uses.
sidebar:
  order: 4
---

**Applies to:** legacy Modules 1 and 2, spring 2026 version (`legacy-v0.2.0` and later).

The mean bars are two vertical lines on the raw data graph. Most calibration
and measurement buttons use only the data between them.

## Place the mean bars

1. [Plot your data](../plot-data/).
2. Zoom or pan so that the section you want is visible.
3. Select the **| |** button under the raw data graph.

The bars start at the beginning of the graph, from 0 to 1 second. **| |**
moves them to the middle of the visible part of the graph. The space between
them is then about one fifth of the visible time range.

## Move the mean bars

- Drag either bar to move that edge.
- Drag the shaded area between the bars to move both bars together.

## How buttons use the mean bars

When you select a calibration or measurement button, such as **O2 Zero** or
**CO2 Cal Zero**, the module averages the mass that the button uses over the
data between the bars. It then writes the result, rounded to 4 decimal
places, into the box next to the button.

Some buttons calculate a slope between the bars instead of an average. See
[Calibrate](../calibration/) and [Record and export results](../results-and-export/)
for what each button measures.

If either bar is outside the plotted data, the box shows `undef`. Move the
bars onto the data and select the button again.
