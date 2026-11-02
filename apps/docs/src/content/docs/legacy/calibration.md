---
title: Calibrate
description: Calibrate O2, CO2, and BiCarb in Module 1, or O2 and CO2 in Module 2, and save calibrations to a file.
sidebar:
  order: 5
---

**Applies to:** legacy Modules 1 and 2, spring 2026 version (`legacy-v0.2.0` and later).

Each calibration button averages one mass between the
[mean bars](../mean-bars/) and writes the result into the box next to it.
Before you select a button, plot the data, select the mass it uses, and
place the mean bars over the part of the run that the button names.

You can also type a value into an editable box and press **Enter** to use it.
If the value is not a number, Module 1 shows the warning
**The entered value is not a numerical value!**

## Calibrate in Module 1

### O2

1. Type the temperature in **Temperature (C)** and press **Enter**.
2. Place the mean bars on the O2 assay buffer zero section of Mass 32.
3. Select **O2 Zero**.

The **O2 Calibration** box fills in. If no temperature is set, it shows
`undef`.

### CO2 (Assay Buffer)

For each step, place the mean bars on that step of Mass 44 and select its
button:

1. **CO2 Cal Zero**
2. **CO2 Cal 6ul**
3. **CO2 Cal 12ul**
4. **CO2 Cal 18ul**

Each value is plotted on the **Assay Buffer** graph of the **Calculated Plots**
tab, against CO2 concentrations of 0, 1000, 2000, and 3000 nmol/ml. The
**BiCarb cal (nmol/ml/mV)** and **Intercept** boxes update after each step.
They use the first and last points that you entered.

### BiCarb (HCL)

For each step, place the mean bars on that step of Mass 44 and select its
button:

1. **BiCarb Cal Zero**
2. **BiCarb Cal 2ul**
3. **BiCarb Cal 4ul**
4. **BiCarb Cal 6ul**

Each value is plotted on the **HCL** graph against BiCarb concentrations of 0,
33.3, 66.6, and 99.9 nmol/ml. The **(nmol/ml/mV)** and **Intercept 2** boxes
update after each step.

### BiCarb/CO2 ratio

After both the CO2 and the BiCarb calibrations, select **BiCarb/CO2**. The box
shows the Assay Buffer calibration divided by the HCL calibration. If either
calibration is missing, it shows `undef`.

### CO2 zero

Place the mean bars on the CO2 zero section and select **CO2 Zero**. The
**CO2 Zero (Mass 44)** and **CO2 Zero (Mass 45)** boxes fill in. The
[results](../results-and-export/) and the **Calculations** tab use these
values.

## Calibrate in Module 2

### CO2

1. For each step, place the mean bars on that step of Mass 44 and select its
   button: **CO2 Cal Zero**, **CO2 Cal 1µl**, **CO2 Cal 2µl**, and
   **CO2 Cal 3µl**.

   Each value is plotted on the **CO2 Calibrations** graph against 0, 1, 2,
   and 3 µl. When you add the 3 µl value, the **CO2/Voltage (ml/mV)** box
   fills in.
2. Place the mean bars on the CO2 zero section of Mass 44 and select
   **CO2 Zero**.

### O2

1. Type the temperature in **Temperature** and press **Enter**.
2. Place the mean bars on the O2 zero section of Mass 32 and select
   **O2 Zero**.
3. Select **O2 Cal**. The O2 calibration box fills in.

## Save and load calibration files

Save your calibrations so that you can reuse them in a later run.

### Save calibrations

1. Select **File > Save Calibration to File**. You can also select **Save** in
   the **Save Calibrations?** dialog when you press **STOP**.
2. Choose a name and location, and select **Save**.

The dialog opens in `Documents\Calibrations` and suggests a name made from the
date and time, such as `26-01-26 15-37-12`. The file is a CSV file.

### Load calibrations

- Module 1: select **File > Load Calibration File**.
- Module 2: select **File > Load Cal File**.

Select the calibration CSV file. The module fills in the calibration boxes
from the file. Module 1 also redraws its calibration graphs.

:::caution
Calibration files from Module 1 and Module 2 are not interchangeable. Load a
calibration file only into the module that saved it.
:::

## Keep calibrations between runs

When you press **STOP**, the **Save Calibrations?** dialog asks whether to keep
your calibrations in the program. Select **Yes** to keep the calibration boxes
filled for the next run, or **No** to clear them. See
[Stop a run](../getting-started/#stop-a-run).

:::caution
**Yes** keeps only the numbers shown in the calibration boxes. At **STOP**, both
modules reset the calibration values they use in calculations, so results show
`undef` until you calibrate again. Repeat the calibration steps on this page
before you measure the next run.
:::
