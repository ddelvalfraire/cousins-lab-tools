---
title: Plot data
description: Plot the raw data, show and hide masses, pause, and rescale the graph.
sidebar:
  order: 3
---

**Applies to:** legacy Modules 1 and 2, spring 2026 version (`legacy-v0.2.0` and later).

The raw data graph plots voltage (mV) against time (s) for each mass.

## Plot the data

1. [Import data](../import-data/).
2. Under the raw data graph, select **Plot**.
3. Select the checkbox for each mass that you want to see, for example
   **Mass 32** or **Mass 44**.

:::note
All mass checkboxes start cleared, so the graph looks empty until you select
at least one mass.
:::

**Plot** does both "plot all" and live plotting. It plots all the data that
already exists, and then keeps adding new data as it arrives. This version has
no separate **Start** button.

While the module plots:

- **Plot** is unavailable until you press **STOP**.
- A spinner shows next to the buttons.
- The window title shows `processing` and the number of seconds plotted so far.

If you select **Plot** before you load data, nothing happens.

## Show and hide masses

Select or clear a mass checkbox to show or hide its line. The colour of each
checkbox label matches its line on the graph.

- Module 1 has checkboxes for masses 32, 34, 36, 44, 45, 46, 47, and 49.
- Module 2 has checkboxes for masses 32, 44, and 45.

## Pause and resume

Select **Pause** to stop adding new data to the graph. The button changes to
**Resume**. Select **Resume** to continue.

## Move around the graph

- **Zoom:** scroll the mouse wheel over the graph.
- **Pan:** drag with the left mouse button.
- **Rescale:** select **Rescale** to show the whole run, from time 0 to the
  latest reading, with voltage from 0 to 500 mV.

## Show lines of best fit

Select **Line Of Best Fit** to draw a dashed straight line through each
visible mass, fitted to the data between the [mean bars](../mean-bars/).
The lines update when you move the bars. Clear the checkbox to remove them.

## Finish plotting

Plotting continues until you press **STOP**. See
[Stop a run](../getting-started/#stop-a-run).
