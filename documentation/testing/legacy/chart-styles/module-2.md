# Chart styles: Module 2

Changing and saving chart line colors and widths in legacy Module 2.
Added in #64 for #42. For the build, test data and settings reset, see
[SETUP.md](SETUP.md).

Preconditions:

1. Module 2 settings are reset (see [SETUP.md](SETUP.md#reset-saved-settings)).
2. Module 2 is open with Acquisition-4971 loaded and plotted, the Mass 32, 44 and 45 checkboxes selected, and Line Of Best Fit enabled.
3. The calibration sequence (CO2 Cal Zero through CO2 Cal 3µl, CO2 Zero, O2 Zero, O2 Cal, CO2 Sample, Calculate) has been run and one row added with Add to Table.

| ID | Title | Steps | Expected result | Result |
|---|---|---|---|---|
| TC-M2-01 | Module 2 isolated from Module 1 | 1. Apply custom styles in Module 1 and close it.<br>2. Open Module 2 and establish the preconditions. | All Module 2 series use their default styles. | |
| TC-M2-02 | Change line color | 1. Double-click the Mass 32 line.<br>2. Set color to #00FFFF.<br>3. Click OK. | Mass 32 line and checkbox label are #00FFFF. | |
| TC-M2-03 | Change color and width in one edit | 1. Double-click the Mass 44 line.<br>2. Set color to #FFFF00 and line width to 7 px.<br>3. Click OK. | Mass 44 line is #FFFF00 at 7 px. Checkbox label is #FFFF00. | |
| TC-M2-04 | Cancel discards edits | 1. Double-click the Mass 45 line.<br>2. Set color to #FFFFFF and line width to 15 px.<br>3. Click Cancel. | Mass 45 line and checkbox label keep their default style. | |
| TC-M2-05 | Mean bar and best-fit styles survive redraw | 1. Set the left mean bar to #FF00FF, 3 px. Click OK.<br>2. Set the Mass 44 best-fit line to #00FFFF, 6 px. Click OK.<br>3. Drag the mean bar region to a new position. | The mean bar keeps #FF00FF at 3 px. The redrawn best-fit line is #00FFFF at 6 px. | |
| TC-M2-06 | CO2 Calibrations point style | 1. Double-click a point on CO2 Calibrations.<br>2. Set color to #FF8800 and width to 3 px.<br>3. Click OK. | The points are #FF8800. | |
| TC-M2-07 | Pressure graph styles | 1. Set the Pressure line to #FF0000, 2 px. Click OK.<br>2. Set the Pressure Derivative line to #00FF00, 6 px. Click OK. | Both lines show their new styles. | |
| TC-M2-08 | Styles persist across restart | 1. Close Module 2.<br>2. Reopen Module 2 and restore the preconditions. | All styles from TC-M2-02 through TC-M2-07 are restored. Mass 45 is at its default. Mass 32 and Mass 44 checkbox labels match their lines. | |
| TC-M2-09 | Module 1 isolated from Module 2 | 1. Close Module 2.<br>2. Open Module 1 and establish its preconditions. | Module 1 shows its own saved styles. No Module 2 style appears. | |
| TC-M2-10 | Restore default | 1. Double-click the Mass 32 line.<br>2. Click Restore default, then OK.<br>3. Restart Module 2 and restore the preconditions. | Mass 32 is at its default style before and after the restart. All other saved styles are unchanged. | |
| TC-M2-11 | Overlapping series selection | 1. Double-click a point where two or more lines overlap.<br>2. Select one series from the dropdown.<br>3. Set color to #ABCDEF and click OK. | The dialog lists every series under the cursor. Only the selected series changes. | |
| TC-M2-12 | EZView data source | 1. Restart Module 2.<br>2. Load the EZView recording with File > Load EZView Data File and plot it.<br>3. Double-click the Mass 44 line. | Saved styles apply to the EZView plot. The Series appearance dialog opens for Mass 44. | |
| TC-M2-13 | Exports unaffected by styles | 1. With no saved styles, export the results table with Export Table.<br>2. Apply several custom styles, restart, repeat the same session with identical mean bar positions, and export again.<br>3. Compare the two files. | The CSV files are identical. | |
