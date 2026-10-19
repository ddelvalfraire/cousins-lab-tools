# Acquisition prototype: JII leaf-disc CO2 and fluorescence

A working proof of concept for the refactor. Experiment templates drive the screens: the JII
leaf-disc template, and presets that rebuild the chart screens of the three legacy PyQt modules
(see [Legacy module presets](#legacy-module-presets)). A Rust engine owns instruments, timing,
storage, and the calculations, and a Tauri window shows the UI. The UI
reaches the engine only through one table of named commands. No hardware is connected. Every
input is labelled as simulated, replayed, or imported.

```
prototype/
  core/             Rust crate `cousinslab`: the engine, its template, instrument profiles, and tests
  desktop/          Rust crate `cousinslab-desktop`: the Tauri v2 window around the engine
  acquisition-ui/   static UI (no build step) with node tests for its pure modules
  docs/screenshots/ screenshots of the run and review pages
```

The UI follows the look and layout of the first proof of concept (commit `e99400c`): sidebar,
breadcrumbs, a run page laid out on a 12-column grid, view tabs, a time-range toolbar, replay,
and a diagnostics panel. The capture page's header has a status button, and replay sits in a
floating bar. Every value on it comes from the engine.

The engine was first written in Python. It was ported to Rust when the team chose Rust and
Tauri, and the Python package was then removed. The Rust tests repeat every check the Python
tests made, against the same reference files.

## The workflow it represents

This is Diego's sample 150 run, reconstructed from the committed references:

- **Mass spectrometer.** Mass 44 (CO2) is read through EZView's spool file. This is the
  existing app's `readEZView.py` path, which now sits behind the instrument contract.
- **Ambit.** The Ambit runs Protocol 2 from the control notebook (cell 11), with red
  actinic light at 225 and 14 saturation flashes. The CO2 needle is removed after the
  4th flash ("closed system").
- **Analysis that used to happen in Excel.** `ubar CO2 = (m44 - mzero) * 1831.11`, using
  the workbook's injection-curve slope. Fluorescence is `(S - 815.52) / R`. Each plant is
  compared around the closed-system moment.

Everything above lives in `core/templates/jii-leaf-co2-fluorescence.yaml`, with the source
cell for each value.

## How the pieces talk

`core/src/api.rs` holds `Engine::call(command, args)`, a single match over command names such
as `list_templates`, `start_run`, `session_live`, `preview_alignment`, and `query_session`.
Each command parses its arguments into a struct. Every failure comes back as `{kind, message}`
with `kind` one of `not_found`, `invalid`, `conflict`, or `internal`.

- The desktop app registers three Tauri commands. `api` runs `Engine::call` on a blocking
  thread, `show_in_folder` reveals an export in Explorer and refuses paths outside the data
  folder, and `pick_path` opens the system's file or folder dialog for Browse. In the window a
  chart's Save as PNG goes to Downloads and the app then shows the file in Explorer, since
  WebView2 gives no other sign. Show in folder and the table's Copy work as in a browser.
- The UI calls `call(command, args)` in `acquisition-ui/util.js`, which goes through
  `window.__TAURI__.core.invoke("api", ...)`.
- `core/examples/dev_server.rs` serves the same UI and the same `Engine::call` on 127.0.0.1
  for checks in an ordinary browser. It is a development tool, not part of the app.

## Run it

For a Mac demo, run `bash prototype/scripts/build-macos-demo.sh` from the repository root.
It builds a local app with the templates and reference recordings bundled inside and places
it in `~/Downloads/Cousins Lab Demo`. See [the Mac demo walkthrough](docs/MAC-DEMO.md).

Rust 1.90 or later. The engine's tests run anywhere:

```
cd prototype
cargo test                                  # 190 tests, 3 ignored timing probes
cd acquisition-ui && node --test tests/*.test.mjs   # 16 tests, Node 22 or later
```

The first build compiles DuckDB from source, which takes 15 minutes or more. Later builds
reuse it.

The desktop app needs WebView2 on Windows (built in on Windows 11), or `webkit2gtk-4.1` on
Linux, which Ubuntu 22.04 and later package. On Windows, from `prototype`:

```
cargo build -p cousinslab-desktop --features custom-protocol
set COUSINSLAB_DATA=C:\temp\cousinslab-demo
target\debug\cousinslab-desktop.exe
```

Without `COUSINSLAB_DATA`, sessions go to the app's data folder. Instrument profiles read the
reference recordings from the repository's `reference/instruments`, so run the app from a
checkout.

To use a browser instead, from `prototype`:

```
cargo run -p cousinslab --example dev_server -- --data /tmp/cousinslab-demo
```

Then open http://127.0.0.1:8765.

## The run page is template configuration

The template's `layout` lists views, and each view lists components placed on a 12-column grid
with `x`, `y`, `w`, and `h` in grid cells. A component is bound to something the engine knows:

| Kind | Binding | Default size |
|---|---|---|
| `chart` | `chart:` a template chart id: a time chart, or an xy chart of a calibration or of measurement results | 8 x 4 |
| `metric` | `value:` a derived value (its role comes with it) | 4 x 2 |
| `controls` | optional `role:`; Mark, Stop, Cancel, readiness, per-capture status | 4 x 3 |
| `inputs` | optional `parameters:`; each parameter's value and where it came from. `entry` parameters get a field that saves on change | 6 x 4 |
| `readings` | `steps:` calibration or measurement steps; a button per step reads the selected range | 3 x 6 |
| `table` | `measurement:`; the next row's results, Add to table, Export, Copy, Clear, and the rows | 4 x 7 |
| `captures` | optional `role:`; requested start, start command, first sample, rows | 12 x 3 |
| `group` | `components:` a nested grid | 12 x 5 |

Sizes default per kind, and a component without `y` goes below the previous one. Validation
rejects unknown kinds, components outside the grid or
overlapping a sibling, unknown charts, derived values, roles, or parameters, a metric given a
role other than its derived value's, and malformed views or components. A template
without a layout gets one view with every chart, then controls and the capture table.

A component bound to an excluded role is hidden, the same way charts are. The engine returns
the reason per component (`hidden_components`), and the layout editor shows hidden components
dimmed with that reason so a save never drops them. On the run page a component widens into
empty columns beside it and lengthens into empty rows below it, and rows nothing uses close up,
so neither the template's gaps nor a hidden component leave holes; a view with `fill: false`
keeps the exact geometry. Run controls show only while the session is running: on a finished
run or an import their buttons can do nothing, and the header's status card shows the captures. A layout edit is saved as a new revision,
and a session keeps the layout of the revision it ran with.

**Starting the instruments.** The Start run dialog's *Start* choice applies to that run only and
is never saved to the template. *Together*, the default, starts every instrument when the run
starts. *Stagger* starts each after its own delay in seconds, prefilled from the template's start
delays and divided by the replay speed as they are. *By hand* leaves each ticked instrument
waiting, and the run controls show a *Start* button for it; its requested start is the moment
the button is pressed. While a capture waits on a delay, the controls count down to it. Stop run
still stops everything, and an instrument never started ends as `not_started` with no rows. Each
capture in `session.json` records how it started (`start`: `{"delay_s": 10}` or
`{"manual": true}`) next to its requested start, start command, and first sample.

## Legacy module presets

Three built-in templates rebuild the chart screens of the legacy PyQt modules. Each preset is
only template YAML (`core/templates/legacy-module*.yaml`): the same engine, run page, and
commands as the JII template, with no module-specific code in either.

| Preset | Legacy screen | Ours, on the sample data |
|---|---|---|
| Rubisco kinetics (module 1) | [module1-legacy](docs/screenshots/module1-legacy.png) | [module1-preset](docs/screenshots/module1-preset-1440.png) |
| CO2 and O2 in µbar (module 2) | [module2-legacy](docs/screenshots/module2-legacy.png) | [module2-preset](docs/screenshots/module2-preset-1440.png) |
| Atom% 49 isotope enrichment (module 3) | [module3-legacy](docs/screenshots/module3-legacy.png) | [module3-preset](docs/screenshots/module3-preset-1440.png) |

The grids keep the legacy arrangement: which charts, in which row, at what relative width, with
the legacy titles, series colours and xy axis labels (time charts show their unit in the tile
header rather than as an axis title). Module 2 has calibration values and the CO2 calibration chart, then
Pressure and Pressure Derivative across the top, the raw masses full width, and the CO2 buttons,
O2 block, and results table along the bottom. Module 1 has the Assay Buffer and HCL calibration
charts and the velocity chart on top, eight raw masses, and the O2, CO2, BiCarb, blank and
extract buttons beside the results table. Module 3 has Atom49% and its rate of change on top,
the raw masses, and Get Mean beside its table below (legacy centred the two in a narrow
column). The buttons and inputs work differently: Plot All, Start, Pause and the speed slider
become Start run, the time-range toolbar and the floating replay bar, the mass checkboxes become the chart legend, and a reading is taken over a range
selected on a chart rather than between two bars.

**What the presets show about the design.**

- The formulas from the legacy `Calculations.py` files are template expressions. The engine
  computes them once, from stored rows, for the live page and for review alike.
- Calibration readings, typed values, and table rows are saved as numbered records that are
  never edited. Remove saves a retraction. A fit or a parameter change recomputes every
  derived value from the first row, so µbar before the calibration is no longer stuck at 0.
- Rates are slopes per second over the recording's own clock, so a 50x replay gives the same
  numbers as an import.

**Try it.** Sessions, Import recordings, pick a module preset, and import `SampleData.zip`.
Or press Start on a preset to replay the same files live. On the run page press Select range,
zoom in on a chart, drag over a step, and press its button. The selection shows what the
button would read before it saves. These ranges of the sample (seconds on its own clock) fill
every chart:

| Preset | Steps and ranges |
|---|---|
| Module 2 | CO2 Cal Zero 880-895, 1 µl 925-948, 2 µl 970-1005, 3 µl 1030-1065; CO2 Zero and O2 Zero 880-895; sample 2800-3000; Temperature 25, then Add to table |
| Module 1 | O2 Zero 880-895 and Temperature 25; assay buffer points on the module 2 CO2 ranges; BiCarb Cal Zero 480-499, 2 µl 520-545, 4 µl 568-588, 6 µl 612-650; CO2 Zero 880-895; Blank 720-765; Extract 4100-4600 and 6000-6600, each added to the table |
| Module 3 | Get Mean 2000-2100 (mean of the rate over 954 rows) |

**Typed values and calibrations from elsewhere.** The pencil on a readings step turns its value
into a field per reading; Enter or leaving the field saves it as a typed record, Escape drops
it. Each step shows where its value came from: Read, Typed, Copied (from another session) or
Loaded (from a file), with the session and record or the file on hover. The capture page
header has a Calibrations menu for the whole session:

- *Use calibrations from another session* lists the sessions of the same template that hold
  calibrations and copies the latest value of every calibration step and entered parameter.
- *Export calibrations* writes them to `exports/calibrations-<last record>/calibrations.csv`.
- *Load calibration file* takes a file exported here, or in a module 1 session the legacy
  module 1 calibration CSV. Its columns go where the legacy loader put them: Temp to the
  temperature, O2 Buffer Zero to the O2 Zero step, the CO2 and BiCarb columns to the assay
  buffer and HCL points. O2 Calibration and BiCarb/CO2 load only when the file lacks the values
  that compute them; otherwise the session computes them and says so.

Every copied or loaded value is a new record, so Remove on a step brings back what it held
before. The path is typed in, or in the desktop app picked with Browse.

The sample recording is not a Rubisco assay, so module 1's velocities only show the screen
working. Module 2's %CO2 per mV comes out at 0.00062752 with the ranges above, 0.2 % from the
legacy 0.0006285103 on the same files. The least-squares fit alone (B2) accounts for little of
that: on the legacy per-file means it gives 0.00062833. The rest is that a reading here is the
mean of every stored row in the range, not of one mean per frame file, over ranges chosen by
hand.

**Legacy bugs, fixed in the presets only.** The legacy code is unchanged. Bug ids follow the
review of the legacy modules.

| Bug | Legacy behaviour | Preset |
|---|---|---|
| B1 | Calibration intercept reported in mV (key and value swapped) | Intercept in the known units: µl (module 2), nmol/ml (module 1) |
| B2 | Slope from the first and last points in insertion order | Least squares over all points; redoing a point replaces only that point |
| B4, B5, B14, B27, B28 | Charts page one window at a time, scale y from the last point, apply ranges to the wrong chart, or start with ranges that hide the data | Charts fit the data and the selected time range |
| B6 | Assay-buffer CO2 slope labelled "BiCarb cal" | "CO2 cal (nmol/ml/mV)" and "BiCarb cal (nmol/ml/mV)" |
| B7 | Velocity x axis "[CO2] (nmol/ml/sec)", y without units | "[CO2], [O2] (nmol/ml)" and "Velocity (nmol/ml/s)" |
| B8 | Blank and Extract rates from the two samples at the bar edges | Regression slope over the range (lab check) |
| B10 | A blank of exactly 0 blocks Extract; the O2 blank is never checked | An unread blank is unset and leaves results unset; 0 is a valid blank |
| B12 | Pressure derivative is previous minus current, per sample, with a first-point spike | Slope per second over the recording clock, rising positive, 5 s window |
| B13 | µbar computed once at ingestion; points before calibration stay 0 | Recomputed from stored mass 44 whenever the calibration changes |
| B15 | "CO2/Voltage (ml/mV)" holds %CO2 per mV | Labelled %CO2/mV; the 1/28 is its own parameter |
| B16 | CO2 per volt computed only on the 3 µl button, and crashes on an empty field | Fitted once enough points exist; each unread point shows as Not read |
| B17 | 9200 hard-coded | `ubar_per_pct` parameter with a note |
| B18 | O2 labelled µbar | µmol/L (module 2) and nmol/ml (module 1), flagged as a lab check |
| B19 | Temperature defaults to 0 and applies only on Enter | No default; O2 Cal stays unset until a temperature is typed; saved on change |
| B20 | Module 2's calibration save writes module 1's header over its 9 values, and its load indexes past them and fails | Both modules export and load the app's own calibration file; module 1 also loads its legacy file; a legacy module 2 file is refused and named as such |
| B21 | Copy never connected in modules 1 and 2 (module 3's copied the selected cells) | Copy puts the whole table on the clipboard as tab-separated text (checked in a browser and in the Windows window) |
| B22 | Get Mean takes the first rate of a batch | Mean of the rate over the stored rows in the range |
| B23 | ln(atom%) plotted under "Atom49%" | The chart plots atom%; ln is a separate value |
| B24, B25 | 15-point rate window, emitted from partial windows | 12 s window on the clock, full windows of at least 60 points only |
| B26 | A zero denominator or ln 0 gives −inf or NaN that spreads into later slopes | No value for that row, and windows skip it |
| B30 | +0.0018 in module 3's O2 polynomial | The module 3 screen never used it; the module 1 and 2 presets use −0.0018 |

B3, B11 and B29 are in code the presets do not have (bar-edge loops and the Plot All timer
thread). B31 is module 3's calibration save and load; module 3 has no calibrations, so its
preset has no Calibrations menu.

**Lab checks.** These are choices the legacy code made that the presets keep or change and
the lab should confirm:

- B8: regression slope or two-point slope for Blank and Extract.
- B9: [CO2] through the BiCarb/CO2 ratio, and [O2] with no zero subtracted.
- B15: the 1/28 factor and the chamber volume.
- B17: 9200 µbar per %, or the measured barometric pressure.
- B18: the O2 units and the source of the air-saturation polynomial.
- Rate windows: 12 s for atom% 49 (the spreadsheet's 14 files) and 5 s for the module 2
  derivative.
- Module 3: whether the rate chart should show the log rate (as now) or the linear rate.
- The fit direction (known value on reading), and whether the 0 µl point should also set the
  CO2 zero.
- The legacy known values: 6 µl as 1000 nmol/ml and 2 µl as 33.3.
- A legacy module 1 calibration file: whether its O2 Calibration and BiCarb/CO2 were ever
  typed over the computed values. The load recomputes them when the file holds what computes
  them (O2 Calibration then comes from the unrounded O2 zero, not the file's 4 decimals).
- Readings average every stored row in the selected range; legacy averaged one mean per frame
  file between its bars. Means and slopes differ slightly from legacy for that reason.

**The lab's own data.** Import recordings takes a zip or a folder of frame files, picked from
the suggested list or typed as a path. In the desktop app each path field, here, at Start run
and in Load calibration file, has Browse: it opens the system's file dialog (File and Folder
where a zip or a folder is accepted) and fills the field; nothing runs until you press Import,
Start or Load. A browser on `dev_server` has no native dialog, so it shows no Browse. Frame
files may have the nine fields of the sample or the eleven `readEZView.py` writes: the two
extra fields are EZView channels 11 and 12, stored as `ch11` and `ch12`, and a time written
as `1250.0` reads as 1250 ms. A folder's files are copied into the capture's `raw/`, and its source hash is
the SHA-256 of the `sha256sum` listing of those files in name order. Start run has a field per
replay role for the recording to replay; empty keeps the profile's. The engine refuses a path
that is missing or that it cannot read before it creates the session, and changes neither the
profile nor the template; the capture's manifest records the path it used.

**Live from EZView.** The profile `ms-ezview-spool-masses` reads an EZView spool (input kind
hardware; it sends nothing to the instrument) with the channel of each mass as `readEZView.py`
writes it (m32 ch5, m34 ch2, m36 ch4, m44 ch3, m45 ch1, m46 ch6, m47 ch7, m49 ch8) and
`t_legacy_ms` as the elapsed clock the presets' rates and readings need. To use it, choose it
for the role on a preset's Setup tab and save; the list offers every profile whose columns and
clocks cover what the role's derived values, charts and steps use. Then give the spool file at
Start run, which runs hardware at 1x. The presets keep the replay profile as their default. It
has been run against the spool fixtures, not a real spool. There is no simulated variant: the
decoder cannot produce the sample's values (it never yields negatives, and channel 5's range
caps m32 near 1.14), so a simulator would have to invent data.

**Raw rows.** The session page's Export tab writes one capture's stored rows as CSV with their
original columns, and a JSON sidecar with the session, capture, source files and hashes, row
count, and column units (command `export_capture_csv`). A capture with `t_ms` and the eight
masses can also be written in the layout legacy wrote at STOP: Count, Time (ms from the first
row), m32 to m49. Legacy wrote one row per frame file, the mean of its rows; this has every
stored row. An export is never overwritten: the same capture with the same rows returns the
files already there.

**Live charts over a long run.** Each capture's live buffer keeps its last 25,000 rows at full
rate and, before them, every n-th row, n doubling whenever more than 25,000 are kept: at most
50,000 points per capture, and *All* starts at the first row. A parameter change recomputes the
older points from the stored rows, so rates keep full windows. Readings and analysis read the
stored rows as before. The page keeps the same bound per series: past 75,000 points it halves
all but the last 25,000.

**Missing frame files.** Legacy drew a straight line across frames missing from a recording.
Here every time chart of that capture's role shades the hole, live and on review, from the last
row before it to the first row after it, and hovering the band names the missing frames.

**Known gaps.** These are legacy features the presets do not have yet:

- Saving calibrations at STOP. Legacy kept them for the next run on its own; here the next
  session copies them or loads an exported file.

## JII leaf-disc preset

`core/templates/jii-leaf-disc-preset.yaml` does for the JII fluorometer and the mass spectrometer
what the module presets do for the legacy screens. It moves the analysis Diego does in his
workbook onto the run page. Roles, Protocol 2 and the closed-system event are those of the JII
template, which stays as it was. The Gas view is in
[jii-preset](docs/screenshots/jii-preset-1440.png).

| View | For |
|---|---|
| Gas | CO2 in µbar, its rate, raw mass 44 and the injection curve, on the mass spec's own clock. Calibration and zero steps, the leaf steps, and the leaf table |
| Fluorescence | Fluorescence with the saturation flashes marked, on the Ambit's own clock. Fs and Fm' steps and a row per flash |
| Together | CO2 and fluorescence on one axis around the closed-system moment, as in the JII template. No readings |

**Formulas.**

- µbar per µl injected is `pressure_kpa * 10 / cuvette_ml`, from 92.2 kPa and 1.38 ml. The
  workbook's I12 computes the same value as µl / (ml * 1000) * kPa * 10000.
- A least-squares line of µl on mass 44 over the 0, 1, 2 and 3 µl injections, times µbar per µl,
  gives `ubar_per_mv`. With the workbook's readings typed in (0.3111, 0.6912, 1.0681, 1.4005 mV)
  it is 1831.1123, the workbook's P14.
- `ubar_co2 = (m44 - co2_zero_mv) * ubar_per_mv`, with a zero per leaf, as in sheets 150-pl1
  and 150-pl2. The rate is the slope over a 10 s window.
- The leaf row has three readings. Dark respiration and net uptake are slopes of µbar CO2 over a
  range, and the compensation point is the mean over the plateau. µmol/s comes from
  n = pV/RT, which needs the temperature. Per m² comes from the leaf disc area and stays empty
  until the area is typed.
- Fluorescence is `(S - 815.52) / R` (notebook cell 13). A flash row reads Fs as the mean before
  the flash and Fm' as the maximum during it (the `max` statistic). PhiPSII is
  (Fm' - Fs) / Fm'.

**Try it.** Import `Raw data-mass spec.xlsx` for ms and `Ambit raw data_sample_150_pl1.csv` for
light. Typing the four injection readings and a zero of 0.303 reproduces the workbook's µbar
column for 150-pl1: 981.03 at its first row and 6.015 at its last. On the sample:

| Step | Range (s on that capture's clock) | Result |
|---|---|---|
| Net uptake after closing | 3713-3725 | 18.81 µbar/s, 0.00105 µmol/s at 25 °C |
| Compensation point | 4100-4140 | 6.34 µbar (the workbook ends pl1 at 6.0) |
| Dark respiration | 4186-4209 | 0.026 µbar/s |
| Flashes 1 to 5 | Fs over the 2 s before each flash, Fm' over the 1.4 s from its start | PhiPSII 0.38, 0.36, 0.35, 0.35, 0.31 |

Each of these readings was checked by hand against the workbook and the CSV.

**How the page behaves.**

- On a finished session a range can be selected only with the reference *Elapsed since each
  start*, which is the preset's default. The Together view needs *Shared event*. The workbook has
  no clock time, so the mass spec's event time is entered once under Align & compare. For
  150-pl1 it is 3701.772 s, the workbook's zero row.
- The selected range and the time window are shared by all views. A range brushed on the Gas
  view, in mass spec seconds, still applies when you switch to Fluorescence, where the seconds are
  the Ambit's. *All* spans the whole mass spec acquisition, so the Fluorescence view needs
  *Custom* (for example 200-345 s) to show the flashes.
- Start run replays the legacy frame files for ms. The EZView simulator stamps its frames with
  this computer's clock, which replay speed stretches, so readings cannot use it. A live
  EZView spool goes through `ms-ezview-spool-masses`.

**Lab checks.**

- PhiPSII is an inference. The notebook names PSII but computes only (S - offset) / R.
- Sign convention: net uptake is positive when CO2 falls, and dark respiration is positive when
  CO2 rises.
- The sample has no dark stretch with the chamber closed before the light. The dark respiration
  range above comes after the Ambit protocol ends (about 4146 s) and before the next flush.
- The linear stretch after closing is short (CO2 falls about 18 µbar/s, then levels off), so
  the uptake range is a judgement call.
- Cuvette volume 1.38 ml and pressure 92.2 kPa are the workbook's constants. Both can be typed
  over per session.
- The leaf disc area has no default.
- The workbook's µmol column (K12) gives 0.0222 µmol per µl injected. pV/RT at 92.2 kPa and
  25 °C gives 0.0372. The preset uses pV/RT.
- The 10 s rate window.

## Demonstration guide

**1. Template.** Open *Experiment templates*, then the leaf-disc template. *Setup* lists the
roles, the instrument profiles, the per-role start delays, the failure policy, Protocol 2's
requested timing, the parameters, the derived values, the alignment event, and the charts.
*Run-page layout* shows the two views of the run page in edit mode.

**2. Simulated grouped run.** Choose *Start run with r1* and pick 20x.
- The MS is a simulated EZView spool. It holds the researcher's recorded values, written
  now with this computer's clock.
- The Ambit replays `Ambit raw data_sample_150_pl1.csv`.
- *Start* is *Together* by default, so both captures start at once and their first samples land
  a fraction of a second apart in the capture table. *Stagger* starts the Ambit after its
  template delay of 30 s, which 20x turns into 1.5 s, and the run controls count down to it.
  *By hand* with the Ambit ticked gives the run controls a *Start* button for it.
- The run opens on the capture page. CO2 and fluorescence charts sit side by side, with the
  CO2 and fluorescence metrics and the run controls beside them and the capture table below.
  *Mass 44 and parameters* is the second view.
- The header's capture button (*2 captures*, with a dot for the most urgent state) opens a card
  with the run clock, each capture's input, rows and recording state, and the diagnostics
  panels.
- The capture table shows requested start, start command, and first sample as separate
  times.
- *Last 30 s*, *Last 1 min*, *All*, and *Custom* (HH:MM:SS on the run clock) window the
  charts. The floating bar at the bottom shows the run time; its *Freeze display* holds the
  window while data keeps arriving. The chevron hides the bar, and the page remembers.
- *Devices*, *Events*, and *Capture logs* in the status card open the diagnostics panel: input
  notes and control capability, flashes and markers, and the engine's timestamps.
- Press *Mark: Closed system* during the run, then *Stop run*. The page switches to replay.

**3. Review the run.**
- On the capture page, *Reference* switches between the shared event, elapsed time, and clock
  time. The floating bar's play button, restart, seek slider, and speed replay the stored data. Metrics
  show the value at the playhead. None of this writes to the session.
- *Review & export* opens the session page. *Align & compare* offers *Clock time*. It works
  here because both captures recorded host clock time. *Shared event* uses the operator marker.
- *Overview* shows Protocol 2's requested timing against what the Ambit replay recorded.

**4. Configuration change.**
- On the template page, set the light delay to 120 s and save. That creates r2.
- Untick *Include* for light and save. That creates r3.
- Start r3. The same run page now shows only the mass spectrometer: the CO2 chart and metric,
  the controls, and the capture table. The fluorescence chart and metric are gone. No screen
  code changed.

**5. Real recorded data.** The import uses a template's latest revision, so first tick
*Include* for light again and save (r4); with r3 the fluorescence chart stays hidden. Go to
*Sessions*, then *Import recordings*, and accept the defaults: the workbook, pl1, and pl2.
- *Clock time* is refused, with the reason given for each capture.
- *Shared event* places each Ambit run at its detected 4th flash. It lists the mass spec
  as unaligned until you enter its event time.
- Enter 3701.772 for 150-pl1 and 4840.772 for 150-pl2, then *Apply entered times*. These are
  the workbook's own zero rows, 7405 and 9683. Then set pl2's `co2_zero_mv` to 0.302 and save.
  Wait for each step's charts to redraw before the next one (see the limitations).
- The CO2 and fluorescence charts now overlay both plants. They were recorded about 19
  minutes apart.
- *Open recording* replays both plants on the saved alignment. Each metric lists one value per
  plant at the playhead.

**6. Data and export.**
- *Data* runs DuckDB over the session's Parquet files. The ASOF example pairs each Ambit
  sample with the latest CO2 reading and shows how old that reading is.
- *Export* writes `aligned.csv` with one header row and every original time column, plus
  `aligned.json` with the alignment, template revision, units, and source hashes. Each path
  has a *Show in folder* button.
- For spool captures, the engine also writes legacy one-frame CSVs that module 1 can read
  (command `export_legacy_frames`).
- *Raw rows (CSV)* writes any capture's stored rows with a provenance sidecar (see
  [Legacy module presets](#legacy-module-presets)).

**7. Layout edit.** On the template, open *Run-page layout*. Drag the capture table's handle
onto the top row; the charts, metrics, and controls move down. Save as the next revision (r5)
and start a run with it. The run page now has the capture table on top. Sessions recorded with
r1 to r4 keep their own layout.

## Acceptance criteria and results

Test names are in `core/src` and `core/tests`. "Window" means the Tauri app on Windows 11,
driven over the WebView2 debugging port. "Browser" means the same UI against `dev_server`.

| # | Criterion | Evidence |
|---|---|---|
| 1 | The spool adapter decodes what `readEZView.py` decodes | `separated_layout_is_byte_identical_to_legacy` compares against frames the unchanged legacy function wrote with a frozen clock (fixtures in `core/tests/fixtures/spool`). `packed_layout_new_reader_keeps_frames_legacy_drops`, `legacy_frames_of_a_stored_spool_capture_match_the_legacy_reader`. |
| 2 | Screens come from the template; a config change alters the run without screen code | r2 (delay 120 s) and r3 (Ambit excluded) saved in the browser; r3's run page showed only the MS (`rust-r3-ms-only-1440.png`). `disabling_a_role_runs_the_remaining_roles_only`. |
| 3 | Grouped start with per-role delays; readiness gate; failure policy | `roles_start_after_their_delays_and_record_requested_and_actual_times`, `not_ready_instrument_prevents_the_whole_group_from_starting`, both `failure_policy_*` tests. In the browser run, light's start command came 0.000 s after its requested time and its first sample 0.051 s after the command. |
| 4 | Parquet with original timestamps and units; crash recovery | `segments_keep_arrow_types_nulls_and_field_metadata`; pyarrow 26 reads the files with `timestamp[us, tz=UTC]` and the unit metadata. `running_session_is_marked_interrupted_with_rows_recounted`, `captures_that_already_finished_keep_their_status`. |
| 5 | Real-data alignment reproduces the researcher's sheets; insufficient timing is refused | `event_alignment_reproduces_both_workbook_sheets` (1,518 rows each, 1e-9) and `clock_alignment_is_refused_when_no_clock_time_was_recorded`. The `aligned.csv` exported in the window and in the browser matched sheets `150-pl1` and `150-pl2` with a largest µbar difference of 0.0. |
| 6 | Live captures align on clock time and on an event, with explicit offsets | `live_session_aligns_on_the_host_clock_and_on_the_operator_marker`, `detected_flash_is_transferred_to_the_mass_spec_over_the_host_clock`. |
| 7 | DuckDB analytics and CSV export carry provenance | The ASOF query ran in the window and the browser. `aligned_export_writes_pythons_csv_and_a_sidecar`. |
| 8 | Requested versus actual Ambit timing | `pl1_timing_summary_matches_python`: 8,010 samples requested over 755.5 s; 7,956 recorded over 756.109 s. |
| 9 | The run page layout is template configuration, validated and versioned | `invalid_layouts_are_rejected_with_the_reason` (every Python case), `layout_edit_becomes_a_new_revision_and_the_old_layout_is_unchanged`, `overlapping_layout_edit_is_rejected_with_the_reason`. |
| 10 | The default layout matches the original arrangement | `template_view_carries_the_layout_and_what_an_excluded_role_hides`; `tauri-run-live-1440.png`. |
| 11 | Components bound to an excluded role disappear | `components_bound_to_an_excluded_role_are_hidden_and_the_rest_stay`; r3 in the browser. |
| 12 | A layout edit in a new revision rearranges the run page without JS changes | Saved from the editor in the browser as r5 with the capture table on top; the r5 run page showed it (`rust-r5-layout-edit-1440.png`). |
| 13 | Time range and replay do not rewrite stored data | `a_finished_run_serves_its_events_and_replay_values_without_changing_stored_files` compares the Parquet bytes after replaying on all three references. |
| 14 | Metrics show values even without a chart, live and in replay | `a_metric_streams_its_derived_value_live_even_when_no_chart_plots_it`, `metric_values_are_served_on_the_same_axis_as_the_charts`. |
| 15 | Diagnostics come from engine records | `session_events_place_flashes_and_operator_markers_on_the_run_clock`, `imported_events_keep_their_native_time_and_have_no_run_clock`. |
| 16 | The UI reaches the engine only through the command table | `acquisition-ui` has no `fetch` or `/api` call; `tests/api.test.mjs`. `failures_come_back_with_a_kind_the_ui_can_tell_apart`. |
| 17 | A researcher's query stays inside its session | `a_query_cannot_reach_outside_its_session_or_run_a_second_statement`, `a_session_connection_never_installs_or_loads_an_extension`. In the window, reading `C:/Windows/win.ini` was refused. |

## Screenshots

From the window on Windows 11 (the system was in dark mode):

| Page | 1440 x 900 | 1024 x 768 |
|---|---|---|
| Home | [tauri-home](docs/screenshots/tauri-home-1440.png) | |
| Run, live | [tauri-run-live](docs/screenshots/tauri-run-live-1440.png) | |
| Run, replay | [tauri-run-replay](docs/screenshots/tauri-run-replay-1440.png) | [tauri-run-replay](docs/screenshots/tauri-run-replay-1024.png) |
| Review, both plants on the event | [tauri-review-overlay](docs/screenshots/tauri-review-overlay-1440.png) | [tauri-review-overlay](docs/screenshots/tauri-review-overlay-1024.png) |
| Settings, data folder | [tauri-settings](docs/screenshots/tauri-settings-1440.png) | |

From the browser against `dev_server`: [run live](docs/screenshots/rust-run-live-1440.png),
[replay](docs/screenshots/rust-run-replay-1440.png),
[replay at 1024](docs/screenshots/rust-run-replay-1024.png),
[r3 without the Ambit](docs/screenshots/rust-r3-ms-only-1440.png),
[alignment](docs/screenshots/rust-review-align-1440.png),
[overlay at 1024](docs/screenshots/rust-review-overlay-1024.png), and
[r5 with the capture table on top](docs/screenshots/rust-r5-layout-edit-1440.png).
The `before-*`, `after-*`, and `original-*` screenshots are from the Python engine and the
first proof of concept.

## What the evidence showed

- **The legacy spool reader can lose frames.** After each frame's terminating line it reads
  and discards one more line. Whether that loses data depends on EZView's real line layout.
  No real spool is in the repository.
- **The 0.5 s workbook series probably did not come from this decoder.** Mass 32 is a
  constant -404.404, which the decoder cannot produce: it zeroes the first hex digit, so
  values are never negative. The legacy CSV also rounds to 3 decimals, which would flatten
  Mass 45.
- **Spool receipt on the host clock is only as fine as the poll interval.** Frames decoded
  in one poll share a receipt time. Alignment uncertainty uses the median non-zero
  interval for that reason.
- **The 4th-flash inference held up on real data.** With the workbook's zero rows, both
  plants' CO2 drawdowns start at 0 s, with the Ambit placed on its detected 4th flash. The
  researcher still needs to confirm it.
- **The port found defects in the Python engine.** A negative parameter after a minus sign
  produced `--`, which starts a SQL comment and cut off the rest of the expression. Capture
  threads changed the manifest while another thread saved it, which crashed once with
  "dictionary changed size during iteration". Text that closed the query wrapper could run a
  second statement, such as `COPY` into the session folder. Two alignment saves in one
  second overwrote each other. The Rust engine fixes each one, with a test.
- **DuckDB downloads extensions unless told not to.** With default settings it fetched its
  ICU extension from the internet the first time a time-zone function ran. An offline lab PC
  would fail there. The engine turns extension installs and loads off, and nothing it does
  needs ICU.

## Deliberate differences from the Python engine

- Errors carry a kind. A missing argument is `invalid` (Python answered 404), an unknown
  alignment is `not_found` (Python answered 500), and bad YAML is `invalid` (Python answered
  500).
- Session and alignment ids that collide within one second get `-2`, `-3`, and so on.
- One thread owns each run's manifest; capture threads report to it.
- The spool simulator starts at the group start, after the readiness check.
- A capture still running 10 s after a stop is recorded as `interrupted`, and the final status
  waits for every capture.
- After a crash, captures that had already finished keep their status.
- `x_uncertainty_s` is a DOUBLE, so queries return a number, not a string.
- Template validation rejects malformed arithmetic and shapes that made Python crash, with a
  reason.
- `session.json` and saved template YAML mean the same as before but are not byte-identical
  (number formatting, YAML quoting). The legacy frame CSVs and the `aligned.csv` header are
  byte-identical.

## Limitations and what is not verified

- **No hardware.** Neither the EZView spool format nor Ambit serial timing has been checked
  against the instruments. The simulator follows the format `readEZView.py` parses.
- **Desktop platform checks.** The original window checks were on Windows 11. The Mac demo
  build uses the native macOS webview. Linux remains untested; the WSL machine used here has
  no `webkit2gtk-4.1`.
- **Reference recordings.** The Mac demo app includes its profiles, templates, and reference
  files. Unpackaged builds read them from the checkout the app was built from.
- **Slow previews in debug builds.** An alignment preview takes 4 to 7 s in a Windows debug
  build. In the window, saving while previews were still redrawing stored an alignment without
  the entered event times and parameter once; with each redraw finished first, the save was
  correct. The cause in the alignment tab is not yet found. Release builds are faster (about
  0.3 s per preview on Linux).
- **Replay speed.** Simulated runs compress sample spacing and start delays by the speed
  factor. Replayed Ambit device counters keep their recorded values. Clock times in those
  sessions are real host times of the replay, not of the original experiment.
- **Simulated placement.** In simulated runs, where the Ambit falls relative to the mass
  spec comes from the configured delay, not from the historical experiment.
- **Live alignment uncertainty.** This is one sample or receipt interval. Receipt latency
  and clock drift are not characterized.
- **The clock on this WSL machine jumps.** Its wall clock stepped about 0.51 s forward every
  32 s against the monotonic clock. A recorded start gap that spans a step reads 0.5 s late.
- **Where the run page still differs from the original.**
  - Replay charts draw the template's event markers but not the operator marker; on the event
    reference the marker is the zero line.
  - The Events tab shows stored times (run clock, host clock, or native clock), not x on the
    selected reference.
  - No device registration or test page and no results-profile table: the engine has none
    of these.
  - The editor's hidden-component notes come from the saved revision, so a role excluded in
    unsaved Setup changes is not shown as hidden until it is saved.
  - Dragging snaps by the grid's minimum row height; rows that grew to fit their content make
    the snap less exact. The arrow keys and the X, Y, W, H fields are exact.
  - The editor moves components within their own grid; moving one into or out of a group means
    removing and adding it, or editing the YAML.
- **Custom clock ranges** are read as wall time on the day the alignment's clock origin falls
  on. A session that crosses midnight cannot be windowed past it by typing a time.
- **The import dialog** offers each template's latest revision only.

## Deferred

- **Device control.** Ambit and pulser serial control: `G`, `A`, `E`, plus the pulser's
  DAC and LED commands, with safe-off on cancel. The commands are documented in the control
  notebook, but none have been sent to the instruments; that waits on the lab. The instrument contract's `cancel` cannot yet reach an
  adapter while it runs; hardware control needs that first.
- **Packaging and notebooks.** An installer with the reference files bundled, and in-app
  Jupyter. Notebooks can read a session's Parquet files with pandas, pyarrow, or DuckDB; the
  Python `open_session` helper went away with the Python engine.
- **Live updates.** The capture page polls every 500 ms. A Tauri channel could push updates
  instead.
- **Other sources and tools.** A protocol editor, and recovering unflushed rows from the raw
  spool copy.
- **Layout.** Dragging between groups, and deleting
  views.
