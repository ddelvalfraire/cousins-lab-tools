# Chart styles: Module 1

Changing and saving chart line colors and widths in legacy Module 1.
Added in #64 for #42. For the build, test data and settings reset, see
[SETUP.md](SETUP.md).

Preconditions:

1. Module 1 settings are reset (see [SETUP.md](SETUP.md#reset-saved-settings)).
2. Module 1 is open with Acquisition-4971 loaded and plotted, all eight mass checkboxes selected, and Line Of Best Fit enabled.
3. The calibration sequence (O2 Zero through Extract) has been run and one row added with Add to Table, so every chart contains data.

| ID | Title | Steps | Expected result | Result |
|---|---|---|---|---|
| TC-M1-01 | Change line color | 1. Double-click the Mass 32 line.<br>2. Set color to #00AA00.<br>3. Click OK. | Mass 32 line and checkbox label are #00AA00. | |
| TC-M1-02 | Change color and width in one edit | 1. Double-click the Mass 44 line.<br>2. Set color to #FFFF00 and line width to 9 px.<br>3. Click OK. | Mass 44 line is #FFFF00 at 9 px. Checkbox label is #FFFF00. | |
| TC-M1-03 | Cancel discards edits | 1. Double-click the Mass 45 line.<br>2. Set color to #FFFFFF and line width to 15 px.<br>3. Click Cancel. | Mass 45 line and checkbox label keep their default style. | |
| TC-M1-04 | Line width boundaries | 1. Set Mass 34 to 0 px, Mass 36 to 0.5 px and Mass 46 to 20 px, clicking OK after each.<br>2. Enter 25 in Line width.<br>3. Double-click each of the three lines. | All three lines render. Line width does not accept values above 20 px. Each line opens the Series appearance dialog showing its saved width. | |
| TC-M1-05 | Mean bar style | 1. Double-click the left mean bar.<br>2. Set color to #FF00FF and line width to 3 px.<br>3. Click OK.<br>4. Drag the mean bar region. | Left mean bar is #FF00FF at 3 px and remains draggable. | |
| TC-M1-06 | Best-fit line style survives redraw | 1. Double-click the Mass 44 best-fit line. If the overlap dropdown appears, select Mass 44 best fit.<br>2. Set color to #00FFFF and line width to 6 px.<br>3. Click OK.<br>4. Drag the mean bar region to a new position. | The redrawn best-fit line is #00FFFF at 6 px. No copy of the previous line remains. | |
| TC-M1-07 | Calculated Plots point styles | On the Calculated Plots tab, set each series below and click OK:<br>1. Assay Buffer: #FF8800, 2 px.<br>2. HCL: #8888FF, 3 px.<br>3. Velocity - Concentration [O2]: #FFFFFF, 2 px.<br>4. Velocity - Concentration [CO2]: #00FF00, 2 px. | Each series shows its new style. The dialog labels the width field "Marker outline width". | |
| TC-M1-08 | Calculations tab styles | On the Calculations tab, set each series below and click OK:<br>1. Sample points: #FF00FF, 2 px.<br>2. Line of best fit: #FFFF00, 5 px.<br>3. d/dt Mass44: #FF0000, 1 px. | Each series shows its new style. | |
| TC-M1-09 | Styles persist across restart | 1. Close Module 1.<br>2. Reopen Module 1 and restore the preconditions (load, plot, calibrate). | All styles from TC-M1-01 through TC-M1-08 are restored. Mass 45 is at its default. Mass 32 and Mass 44 checkbox labels match their lines. | |
| TC-M1-10 | Restore default | 1. Double-click the Mass 32 line.<br>2. Click Restore default, then OK.<br>3. Restart Module 1 and restore the preconditions. | Mass 32 is at its default style before and after the restart. All other saved styles are unchanged. | |
| TC-M1-11 | Overlapping series selection | 1. At full zoom, double-click a point where several lines overlap.<br>2. Select one series from the dropdown.<br>3. Set color to #ABCDEF and click OK. | The dialog shows "Several series overlap. Choose the intended series." and lists every series under the cursor. Only the selected series changes. | |
| TC-M1-12 | EZView data source | 1. Restart Module 1.<br>2. Load the EZView recording with File > Load EZView Data File and plot it.<br>3. Double-click Mass 45, set color to #FF00FF and click OK. | Saved styles apply to the EZView plot. Mass 45 changes to #FF00FF. | |
| TC-M1-13 | Exports unaffected by styles | 1. With no saved styles, export the results table with Export Table.<br>2. Apply several custom styles, restart, repeat the same session with identical mean bar positions, and export again.<br>3. Compare the two files. | The CSV files are identical. For the Calculations tab .xlsx export, values match. Its column order varies between runs regardless of styles. | |
