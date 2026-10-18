# Legacy frame fixtures

`Acquisition-1/` is a small frame export in the shape of `module2/SampleData.zip`: numbered
CSV files with CRLF line ends, no header, `t_ms` running on across files, and negative masses.
Frames 4 to 6 and 9 are missing, and `___All_Errors.txt` lists them as the download tool does.

`../legacy-frames.zip` holds the same CSV files under `Acquisition-1/`, a directory entry, and
`___All_Errors.txt` at the root, all stored without compression as in the sample zip.

`../legacy-frames-ezview/Acquisition0/` is hand-written in the shape `readEZView.py` writes
(lines 100-119): files numbered from 0, LF line ends, the time column as a float, and eleven
fields, the eight masses followed by EZView channels 11 and 12. Frame 2 is missing.
