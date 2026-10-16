# EZView spool parity fixtures

Produced once from the Python engine at commit 4c0a6b3, with the helpers in
`prototype/engine/tests/test_spool_parity.py`.

- `separated.txt` and `packed.txt` are `write_spool(path, separator="\n")` and
  `write_spool(path, separator="")`: the five `FRAMES` with gain `2a7`, stamped
  `FROZEN_START` (2026-09-30 09:00:00) plus 1.25 s + 0.5 s per frame + 137 µs.
- `legacy-separated/` and `legacy-packed/` are the CSVs that the unchanged legacy reader
  `module1/application/read-data/readEZView.py` wrote for those spools, run by
  `run_legacy_reader` with its clock frozen at `FROZEN_START`. On the packed spool it keeps
  only the first frame.
