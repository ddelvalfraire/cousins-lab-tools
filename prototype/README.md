# Acquisition prototype: JII leaf-disc CO2 and fluorescence

A working proof of concept for the refactor. One experiment template drives the screens.
A Python engine owns instruments, timing, and storage, and the browser UI only calls its
HTTP API. No hardware is connected. Every input is labelled as simulated, replayed, or
imported.

```
prototype/
  acquisition-ui/   static UI (no build step), served by the engine
  engine/           Python package `cousinslab`, its template, instrument profiles, and tests
```

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
uv run pytest            # 27 tests
uv run cousinslab        # http://127.0.0.1:8765, data in engine/data/
```

## Demonstration guide

**1. Template.** Open *Experiment templates*, then the leaf-disc template. It lists the
roles, the instrument profiles, the per-role start delays, the failure policy, Protocol 2's
requested timing, the parameters, the derived values, the alignment event, and the charts.

**2. Simulated grouped run.** Choose *Start run with r1* and pick 20x.
- The MS is a simulated EZView spool. It holds the researcher's recorded values, written
  now with this computer's clock.
- The Ambit replays `Ambit raw data_sample_150_pl1.csv`.
- The Ambit starts after its 30 s delay, which the 20x compression turns into 1.5 s.
- The capture table shows requested start, start command, and first sample as separate
  times.
- Press *Mark: Closed system* during the run, then *Stop run*.

**3. Review the run.**
- *Align & compare* offers *Clock time*. It works here because both captures recorded
  host clock time. *Shared event* uses the operator marker.
- *Overview* shows Protocol 2's requested timing against what the Ambit replay recorded.

**4. Configuration change.**
- On the template page, set the light delay to 120 s and save. That creates r2.
- Untick *Include* for light and save. That creates r3.
- Start r3. The same run screen now shows only the mass spectrometer and its two charts.
  No screen code changed.

**5. Real recorded data.** Go to *Sessions*, then *Import recordings*, and accept the
defaults: the workbook, pl1, and pl2.
- *Clock time* is refused, with the reason given for each capture.
- *Shared event* places each Ambit run at its detected 4th flash. It lists the mass spec
  as unaligned until you enter its event time.
- Enter 3701.772 for 150-pl1 and 4840.772 for 150-pl2. These are the workbook's own zero
  rows, 7405 and 9683. Then set pl2's `co2_zero_mv` to 0.302 and save.
- The CO2 and fluorescence charts now overlay both plants. They were recorded about 19
  minutes apart.

**6. Data and export.**
- *Data* runs DuckDB over the session's Parquet files. The ASOF example pairs each Ambit
  sample with the latest CO2 reading and shows how old that reading is.
- *Export* writes `aligned.csv` with one header row and every original time column, plus
  `aligned.json` with the alignment, template revision, units, and source hashes.
- For spool captures, it also writes legacy one-frame CSVs that module 1 can read.

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

## Deferred

- **Device control.** Ambit and pulser serial control: `G`, `A`, `E`, plus the pulser's
  DAC and LED commands, with safe-off on cancel. The commands are documented in the plan,
  but running them needs authorization.
- **Shell and notebooks.** The Tauri shell and sidecar packaging, and in-app Jupyter. A
  notebook can already call `cousinslab.open_session(path, alignment_id)`, which is tested.
- **Other sources and tools.** The module 1 frame-folder source, a protocol editor, the
  legacy calculations (mean bars, calibration, atom% 49), and recovering unflushed rows
  from the raw spool copy.
