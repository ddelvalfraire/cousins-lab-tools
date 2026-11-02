---
title: Get started with Modules 1 and 2
description: Open Module 1 or Module 2 and find your way around the window.
sidebar:
  order: 1
---

**Applies to:** legacy Modules 1 and 2, spring 2026 version (`legacy-v0.2.0` and later).

Modules 1 and 2 plot mass spectrometer data and calculate results from it.
Both modules read the same data, but they calculate different results:

| | Module 1 | Module 2 |
| --- | --- | --- |
| Masses plotted | 32, 34, 36, 44, 45, 46, 47, 49 | 32, 44, 45 |
| Calibrations | O2, CO2 (Assay Buffer), and BiCarb (HCL) | O2 and CO2 |
| Results | V0, Vc, [CO2], and [O2] | %CO2, µBar CO2, and µBar O2 |
| Extra features | **Calculations** tab, **Save All Data**, autosave | **Pressure** and **Pressure Derivative** graphs |

## Open a module

Each module is a separate Windows program:

- Module 1: `LabView_module_1.exe`
- Module 2: `LabView_module_2.exe`

Double-click the program. A loading spinner shows while the window opens.
The window fills the screen and its title is **LabView**.

:::note
The modules save files to fixed folders under `C:\Users\<your user name>\Documents`,
so they are made for Windows.
:::

## Parts of the window

From top to bottom, the window has three areas:

1. **Calculated graphs.** These show calibration lines and results.
   - In Module 1, they are on the **Calculated Plots** tab. A second tab,
     **Calculations**, holds the custom calculation graphs.
   - In Module 2, they are the **CO2 Calibrations**, **Pressure**, and
     **Pressure Derivative** graphs.
2. **Raw data graph.** This plots voltage (mV) against time (s) for each mass.
   The mass checkboxes and the plot buttons are next to it.
3. **Controls.** These are the calibration buttons, the result boxes, the
   results table, and the **STOP** button.

In Module 1, you can drag the borders between the areas to resize them.

The **File** menu has these commands:

| Command | Module 1 | Module 2 |
| --- | --- | --- |
| **Load Acq Folder** | Yes | Yes |
| **Load Calibration File** / **Load Cal File** | Yes | Yes |
| **Load EZView Data File** | Yes | Yes |
| **Save Calibration to File** | Yes | Yes |
| **Save All Data** | Yes | No |
| **Load All Data** | Yes | No |

## Typical session

1. [Import your data](../import-data/).
2. [Plot it](../plot-data/).
3. Use the [mean bars](../mean-bars/) to select parts of the data.
4. [Calibrate](../calibration/).
5. [Record and export your results](../results-and-export/).
6. Press **STOP** to end the run. See [Stop a run](#stop-a-run).

## Stop a run

Press **STOP** when you finish a run, or before you load different data.

1. In the **WARNING!!** dialog, select **OK** to continue or **Cancel** to go back.
2. The **Save Calibrations?** dialog asks whether to keep your calibrations in
   the program:
   - **Yes** keeps the numbers in the calibration boxes. Before the next run,
     load your calibration file again or calibrate again. See
     [Keep calibrations between runs](../calibration/#keep-calibrations-between-runs).
   - **No** clears them.
   - **Save** opens a dialog to save the calibrations to a file first. See
     [Save calibrations to a file](../calibration/#save-and-load-calibration-files).
3. The module writes raw data files. See
   [Raw data saved at STOP](../results-and-export/#raw-data-saved-at-stop).
4. The module clears the graphs and calculated values, and the window title
   changes back to **LabView**. You can now load new data.

## If Module 1 closed unexpectedly

Module 1 saves your work automatically to
`Documents\ApplicationData\autosave.json` about 2 seconds after each change.
If the program did not close properly last time, it asks:

> The application was not closed properly. Would you like to load the last autosave?

Select **Yes** to restore the values, table, and samples from the autosave.
