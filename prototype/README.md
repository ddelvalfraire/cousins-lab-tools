# Acquisition prototype: JII leaf-disc CO2 and fluorescence

A working proof of concept for the refactor. One experiment template drives the screens. A
Rust engine owns instruments, timing, and storage, and a Tauri window shows the UI. The UI
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
breadcrumbs, a run page laid out on a 12-column grid, view tabs, a status strip, a time-range
toolbar, replay, and a diagnostics panel. Every value on it comes from the engine.

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

- The desktop app registers one Tauri command, `api`, that runs `Engine::call` on a blocking
  thread, and `show_in_folder`, which reveals an export in Explorer and refuses paths outside
  the data folder.
- The UI calls `call(command, args)` in `acquisition-ui/util.js`, which goes through
  `window.__TAURI__.core.invoke("api", ...)`.
- `core/examples/dev_server.rs` serves the same UI and the same `Engine::call` on 127.0.0.1
  for checks in an ordinary browser. It is a development tool, not part of the app.

## Run it

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
| `chart` | `chart:` a template chart id | 8 x 4 |
| `metric` | `value:` a derived value (its role comes with it) | 4 x 2 |
| `controls` | optional `role:`; Mark, Stop, Cancel, readiness, per-capture status | 4 x 3 |
| `inputs` | optional `parameters:`; the revision's parameters, read only | 6 x 4 |
| `captures` | optional `role:`; requested start, start command, first sample, rows | 12 x 3 |
| `group` | `components:` a nested grid | 12 x 5 |

Sizes default per kind, and a component without `y` goes below the previous one. Validation
rejects unknown kinds, `calibration` (no engine model yet), components outside the grid or
overlapping a sibling, unknown charts, derived values, roles, or parameters, a metric given a
role other than its derived value's, and malformed views or components. A template
without a layout gets one view with every chart, then controls and the capture table.

A component bound to an excluded role is hidden, the same way charts are. The engine returns
the reason per component (`hidden_components`), and the layout editor shows hidden components
dimmed with that reason so a save never drops them. A layout edit is saved as a new revision,
and a session keeps the layout of the revision it ran with.

## Demonstration guide

**1. Template.** Open *Experiment templates*, then the leaf-disc template. *Setup* lists the
roles, the instrument profiles, the per-role start delays, the failure policy, Protocol 2's
requested timing, the parameters, the derived values, the alignment event, and the charts.
*Run-page layout* shows the two views of the run page in edit mode.

**2. Simulated grouped run.** Choose *Start run with r1* and pick 20x.
- The MS is a simulated EZView spool. It holds the researcher's recorded values, written
  now with this computer's clock.
- The Ambit replays `Ambit raw data_sample_150_pl1.csv`.
- The Ambit starts after its 30 s delay, which the 20x compression turns into 1.5 s.
- The run opens on the capture page. CO2 and fluorescence charts sit side by side, with the
  CO2 and fluorescence metrics and the run controls beside them and the capture table below.
  *Mass 44 and parameters* is the second view.
- The status strip shows the run clock and, per capture, the input badge (Simulated, Replay),
  acquisition state, recording state, and rows.
- The capture table shows requested start, start command, and first sample as separate
  times.
- *Last 30 s*, *Last 1 min*, *All*, and *Custom* (HH:MM:SS on the run clock) window the
  charts. *Freeze display* holds the window while data keeps arriving.
- *Devices*, *Events*, and *Capture logs* open the diagnostics panel: input notes and control
  capability, flashes and markers, and the engine's timestamps.
- Press *Mark: Closed system* during the run, then *Stop run*. The page switches to replay.

**3. Review the run.**
- On the capture page, *Reference* switches between the shared event, elapsed time, and clock
  time. *Play interval*, restart, the seek slider, and *Speed* replay the stored data. Metrics
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
- **The window is verified on Windows 11 only.** Linux and macOS builds of the desktop crate
  are untested; the WSL machine used here has no `webkit2gtk-4.1`.
- **Profiles read files from the repository.** `${repo}` in an instrument profile resolves to
  the checkout the app was built from. A packaged app would need the reference files bundled.
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
  - When a role is excluded, its components leave holes; the grid is not compacted.
  - Replay charts draw the template's event markers but not the operator marker; on the event
    reference the marker is the zero line.
  - The Events tab shows stored times (run clock, host clock, or native clock), not x on the
    selected reference.
  - No device registration or test page, no calibration table, no results-profile table, and
    no derived-results deletion: the engine has none of these.
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
- **Other sources and tools.** The module 1 frame-folder source, a protocol editor, the
  legacy calculations (mean bars, calibration, atom% 49), and recovering unflushed rows
  from the raw spool copy.
- **Layout.** A calibration component (needs a calibration model in the engine), compacting
  holes left by excluded roles, dragging between groups, and deleting views.
