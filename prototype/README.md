# Acquisition prototype: JII leaf-disc CO2 and fluorescence

A working proof of concept for the refactor. One experiment template drives the screens.
A Python engine owns instruments, timing, and storage, and the browser UI only calls its
HTTP API. No hardware is connected. Every input is labelled as simulated, replayed, or
imported.

```
prototype/
  acquisition-ui/   static UI (no build step), served by the engine, with node tests for its pure modules
  engine/           Python package `cousinslab`, its template, instrument profiles, and tests
  docs/screenshots/ before and after screenshots of the run and review pages
```

The UI follows the look and layout of the first proof of concept (commit `e99400c`): sidebar,
breadcrumbs, a run page laid out on a 12-column grid, view tabs, a status strip, a time-range
toolbar, replay, and a diagnostics panel. Every value on it comes from the engine API.

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

Everything above lives in `engine/templates/jii-leaf-co2-fluorescence.yaml`, with the
source cell for each value.

## Run it

Needs [uv](https://docs.astral.sh/uv/). From `prototype/engine`:

```
uv sync
uv run pytest                        # 58 tests
uv run cousinslab --data /tmp/demo   # http://127.0.0.1:8765; without --data, data goes to engine/data/
```

The UI's grid geometry and time-range helpers have their own tests, from `prototype/acquisition-ui`:

```
node --test tests/*.test.mjs         # 9 tests, Node 22 or later
```

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

A component bound to an excluded role is hidden, the same way charts are. The API returns the
reason per component (`hidden_components`), and the layout editor shows hidden components dimmed
with that reason so a save never drops them. A layout edit is saved as a new revision, and a
session keeps the layout of the revision it ran with.

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
- *Review & export* opens the session page. *Align & compare* offers *Clock time*. It works here because both captures recorded
  host clock time. *Shared event* uses the operator marker.
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
- Enter 3701.772 for 150-pl1 and 4840.772 for 150-pl2. These are the workbook's own zero
  rows, 7405 and 9683. Then set pl2's `co2_zero_mv` to 0.302 and save.
- The CO2 and fluorescence charts now overlay both plants. They were recorded about 19
  minutes apart.
- *Open recording* replays both plants on the saved alignment. Each metric lists one value per
  plant at the playhead.

**6. Data and export.**
- *Data* runs DuckDB over the session's Parquet files. The ASOF example pairs each Ambit
  sample with the latest CO2 reading and shows how old that reading is.
- *Export* writes `aligned.csv` with one header row and every original time column, plus
  `aligned.json` with the alignment, template revision, units, and source hashes.
- For spool captures, it also writes legacy one-frame CSVs that module 1 can read.

**7. Layout edit.** On the template, open *Run-page layout*. Drag the capture table's handle
onto the top row; the charts, metrics, and controls move down. Save as the next revision (r5)
and start a run with it. The run page now has the capture table on top. Sessions recorded with
r1 to r4 keep their own layout.

## Acceptance criteria and results

| # | Criterion | Evidence |
|---|---|---|
| 1 | The spool adapter decodes what `readEZView.py` decodes | `test_spool_parity.py` runs the unchanged legacy function with a frozen clock. Output is byte-identical when a blank line separates frames. Module 1's `File` reader parses the exported frames. |
| 2 | Screens come from the template; a config change alters the run without screen code | Template r2 (delay 120 s) and r3 (Ambit excluded) were saved in the UI. r3's run page showed only the MS capture and the CO2 and Mass 44 charts. `test_disabling_a_role_runs_the_remaining_roles_only`. |
| 3 | Grouped start with per-role delays; readiness gate; failure policy | `test_group_run.py` covers requested versus commanded versus first-sample times, a not-ready profile blocking the whole group, and both failure policies. In the UI, r2's Ambit started 27 ms after its requested time. |
| 4 | Parquet with original timestamps and units; crash recovery | Spool timestamp, host receipt time, legacy ms, and the device counter are all stored. Units are in the field metadata. Killing the engine mid-run left a session that came back as `interrupted` with readable segments. `test_session_recovery.py`. |
| 5 | Real-data alignment reproduces the researcher's sheets; insufficient timing is refused | `test_import_alignment.py` reproduces sheets `150-pl1` and `150-pl2` (1,518 rows each) to 1e-9 and refuses clock-time alignment. A mutation check (zero shifted 0.5 s) makes it fail. |
| 6 | Live captures align on actual clock time, and on an event, with explicit offsets | `test_live_session_aligns_on_the_host_clock_and_on_the_operator_marker` and `test_detected_flash_is_transferred_to_the_mass_spec_over_the_host_clock`. |
| 7 | DuckDB analytics and CSV export carry provenance | Checked in the UI: the ASOF query runs, and `aligned.csv` plus `aligned.json` were downloaded. |
| 8 | Requested versus actual Ambit timing | pl1 requested 8,010 samples over 755.5 s. It recorded 7,956 samples, with the device counter spanning 756.109 s. Shown on *Overview*. |
| 9 | The run page layout is template configuration, validated and versioned | `test_layout.py` covers per-kind defaults, stacking, the default layout, and rejection of unknown kinds, calibration, out-of-grid, overlap, unknown bindings, and duplicate ids. `test_api.py` covers a layout edit saved as r2 with r1 unchanged, and an overlapping edit refused with the reason. |
| 10 | The default layout matches the original arrangement | CO2 and fluorescence charts side by side, both metrics and the controls beside them, the capture table below (`after-run-live-1440.png`). |
| 11 | Components bound to an excluded role disappear | `test_components_bound_to_an_excluded_role_are_hidden_and_the_rest_stay`, `test_template_view_carries_the_layout_and_what_an_excluded_role_hides`. In the browser, r3's run page showed no fluorescence chart or metric (`after-run-r3-ambit-excluded-1440.png`). |
| 12 | A layout edit in a new revision rearranges the run page without JS changes | Saved from the editor as r5 with the capture table on top; the r5 run page showed it (`after-run-r5-layout-edit-1440.png`) while an r1 session kept the original arrangement. |
| 13 | Time range and replay do not rewrite stored data | `test_a_finished_run_serves_its_events_and_replay_values_without_changing_stored_files` compares the Parquet bytes. In the browser, the run's 183 Parquet files had the same SHA-256 before and after replaying on clock, elapsed, and event. |
| 14 | Metrics show values even without a chart, live and in replay | `test_a_metric_streams_its_derived_value_live_even_when_no_chart_plots_it`, `test_metric_values_are_served_on_the_same_axis_as_the_charts`. |
| 15 | Diagnostics come from engine records | `test_session_events_place_flashes_and_operator_markers_on_the_run_clock`, `test_imported_events_keep_their_native_time_and_have_no_run_clock`. Checked in the browser for a run and an import. |

## Before and after

Screenshots from a 20x simulated run of r1, taken in a browser against the running engine. The
original prototype's capture page is `docs/screenshots/original-capture-1440.png`.

| Page | Before | After |
|---|---|---|
| Run, 1440 x 900 | [before-run-1440](docs/screenshots/before-run-1440.png) | [live](docs/screenshots/after-run-live-1440.png), [replay](docs/screenshots/after-run-replay-1440.png) |
| Run, 1024 x 768 | [before-run-1024](docs/screenshots/before-run-1024.png) | [live](docs/screenshots/after-run-live-1024.png), [replay](docs/screenshots/after-run-replay-1024.png) |
| Review, 1440 x 900 | [before-review-1440](docs/screenshots/before-review-1440.png) | [after-review-1440](docs/screenshots/after-review-1440.png) |
| Review, 1024 x 768 | [before-review-1024](docs/screenshots/before-review-1024.png) | [after-review-1024](docs/screenshots/after-review-1024.png) |
| Layout editor and edits | none | [editor](docs/screenshots/after-layout-editor-1440.png), [r3 without Ambit](docs/screenshots/after-run-r3-ambit-excluded-1440.png), [r5 capture table on top](docs/screenshots/after-run-r5-layout-edit-1440.png) |

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

## Limitations and what is not verified

- **No hardware.** Neither the EZView spool format nor Ambit serial timing has been checked
  against the instruments. The simulator follows the format `readEZView.py` parses.
- **Replay speed.** Simulated runs compress data, device counters, and start delays by the
  speed factor. Clock times in those sessions are real host times of the replay, not of the
  original experiment.
- **Simulated placement.** In simulated runs, where the Ambit falls relative to the mass
  spec comes from the configured delay, not from the historical experiment.
- **No Tauri shell.** The engine serves the UI on 127.0.0.1 and the UI uses relative API
  paths, so a Tauri sidecar setup could load it unchanged. That is untested.
- **Live alignment uncertainty.** This is one sample or receipt interval. Receipt latency
  and clock drift are not characterized.
- **Where the run page still differs from the original.**
  - When a role is excluded, its components leave holes; the grid is not compacted.
  - The interval toolbar wraps under the view tabs at 1440 px, where the original kept it on
    one row.
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
  DAC and LED commands, with safe-off on cancel. The commands are documented in the plan,
  but running them needs authorization.
- **Shell and notebooks.** The Tauri shell and sidecar packaging, and in-app Jupyter. A
  notebook can already call `cousinslab.open_session(path, alignment_id)`, which is tested.
- **Other sources and tools.** The module 1 frame-folder source, a protocol editor, the
  legacy calculations (mean bars, calibration, atom% 49), and recovering unflushed rows
  from the raw spool copy.
- **Layout.** A calibration component (needs a calibration model in the engine), compacting
  holes left by excluded roles, dragging between groups, and deleting views.
