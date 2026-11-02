---
title: Record and export results
description: Measure samples, add results to the table, and export tables, samples, and raw data.
sidebar:
  order: 6
---

**Applies to:** legacy Modules 1 and 2, spring 2026 version (`legacy-v0.2.0` and later).

[Calibrate](../calibration/) before you measure samples. Each measurement
button uses the data between the [mean bars](../mean-bars/).

## Measure a sample in Module 1

1. Place the mean bars on the blank section and select **Blank**. The **CO2**
   and **O2** boxes in the first row show the slopes of Mass 44 and Mass 32.
2. Place the mean bars on the extract section and select **Extract**.

**Extract** fills in the extract slopes, the extract minus blank rates, and the
averages of Mass 44 and Mass 32. It then calculates **V0**, **Vc**, **[CO2]**,
and **[O2]**. These four boxes show `undef` if the O2 calibration, the CO2
(Assay Buffer) calibration, or the BiCarb/CO2 ratio is missing.

If the mean bars cover fewer than two readings, the module shows
**Not enough data points in mean bar range for slope calculation**.

**Blank Slope** and **Extract Slope** show the least-squares slopes of Mass 44
and Mass 45 between the mean bars.

## Measure a sample in Module 2

- **CO2:** place the mean bars on the sample section of Mass 44 and select
  **CO2 Sample**. The **%CO2** and **µBar CO2** boxes fill in. They need the
  **CO2/Voltage** and **CO2 Zero** values from [calibration](../calibration/#calibrate-in-module-2).
- **O2:** place the mean bars on the sample section of Mass 32 and select
  **Calculate**. The **µBar O2** box fills in. It needs the O2 calibration.

The **Pressure** graph plots µBar CO2 over time from Mass 44, and the
**Pressure Derivative** graph plots its rate of change. Both graphs need the
**CO2/Voltage** and **CO2 Zero** values.

## Add results to the table

Select **Add to Table** to add the current results as a new row:

- Module 1 adds V0, Vc, [CO2], and [O2]. It also plots the row on the
  **Velocity - Concentration Graph**.
- Module 2 adds %CO2, µBar CO2, and µBar O2.

To copy rows, select cells and then select **Copy**. If no cells are
selected, **Copy** copies the whole table. You can paste the result into a
spreadsheet.

To clear the table, select **Purge Table** and confirm. Rows that you have
not exported are lost. Module 1 then asks whether to clear the
**Velocity - Concentration Graph** as well.

## Export the table

1. Select **Export Table**.
2. Choose a name and location, and select **Save**.

The dialog opens in `Documents\TableData`. The file is a CSV file with no
heading row.

## Use the Calculations tab (Module 1)

The **Calculations** tab plots `ln(Mass45 - CO2Zero45)` against
`ln(Mass44 - CO2Zero44)` for the data between the mean bars, with a line of
best fit, R², Delta, and b44/slope. It updates when you stop moving the mean
bars.

1. Set **CO2 Zero** first. If a CO2 zero value is missing, the module shows a
   **Calculation Warning**.
2. Type a value in **Delta Part:** and press **Enter**.
3. Type a name in **Sample Name:**.
4. Select **Add Data** to add the result to the **Samples** table.

To export the samples, select **Export Table** next to the **Samples** table.
The module saves an Excel (`.xlsx`) file, by default in `Documents\TableData`,
with one sheet for each sample. **Clear Table** clears the samples
immediately, without asking first.

## Save and load all data (Module 1)

**File > Save All Data** saves the calculation boxes, the results table, and
the samples to a JSON file. The dialog opens in `Documents\ApplicationData`
and suggests a name such as `AllData_26-01-26 15-37-12.json`.

**File > Load All Data** restores them from a saved file.

## Raw data saved at STOP

When you press **STOP**, Module 2 saves `RawDataAcquisition<n>Data.csv` in
your Documents folder, where `<n>` counts up with each run. It has the columns
`Time`, `Mass 32`, `Mass 44`, and `Mass 45`, with one row every 0.5 seconds.

For an acquisition folder, both modules also write a file named after the
folder, such as `RawDataAcquisition-3510Data.csv`, in `Documents`. In this
version that file can contain only its heading row, so keep the original
acquisition folder as your copy of the raw data.
