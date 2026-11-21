---
title: Import data
description: Load an acquisition folder or an EZView data file into Module 1 or Module 2.
sidebar:
  order: 2
---

**Applies to:** legacy Modules 1 and 2, spring 2026 version (`legacy-v0.2.0` and later).

Modules 1 and 2 read data from two kinds of source:

- An **acquisition folder** from the mass spectrometer. Use **Load Acq Folder**.
- An **EZView data file**. Use **Load EZView Data File**.

Choose the command that matches your data. Loading data does not plot it.
After you load it, [plot it](../plot-data/).

## Import an acquisition folder

The mass spectrometer writes one acquisition folder for each run, for example
`Acquisition-3510`. While the run continues, it adds a new numbered CSV file
to the folder about every second.

1. Select **File > Load Acq Folder**.
2. In the **Select a folder** dialog, select the acquisition folder.
   Select the folder itself, not a file inside it.

The window title changes to **LabView** followed by the full folder path.

You can load a folder while the run is still writing to it. When you plot it,
the module reads the files that already exist and then adds new files as they
appear.

### What the folder must contain

- CSV files with numbers as names, such as `1.csv`, `2.csv`, … `10.csv`.
  The module reads them in number order.
- No heading row. Each row is one reading with nine columns:

  | Column | Contents |
  | --- | --- |
  | 1 | Time, in milliseconds |
  | 2–9 | Voltage (mV) for masses 32, 34, 36, 44, 45, 46, 47, and 49 |

The module shows time in seconds from the first reading. It does not read
subfolders.

## Import an EZView data file

1. Select **File > Load EZView Data File**.
2. In the **Select a file** dialog, select the EZView `.txt` file.

When you plot the file, the module keeps reading lines as EZView adds them.

:::caution
An EZView file contains only masses 44 and 45. The modules fill the other
masses with a placeholder value, so ignore mass 32 and any O2 results when
you work with EZView data.
:::

## Load different data

After you load data, press **STOP** before you load another folder or file.
See [Stop a run](../getting-started/#stop-a-run).
