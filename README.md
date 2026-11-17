# Mass Spectrometer Interface

## Project summary

Each module in this project is a Python program that aids in the use of Mass Spectrometers and other instruments used for analyzing plant respiration in the WSU Cousins Plant Biology Lab.

### Additional information about the project

The project is designed to provide a comprehensive platform for managing and interpreting Mass Spectrometer data through various modules. It aims to present data insights through graphical and numerical perspectives while offering flexible data formatting and integration capabilities. The system consists of five primary modules: the first three focus on different ways to visualize and log Mass Spectrometer data, the fourth module reformats data from a secondary Mass Spectrometer, and the upcoming fifth module combines data streams from three distinct instruments. The general design for each of the modules is to accept input from a file or folder, which is selected by the user, process it in some way (reformat, normalize, derive calculations from, etc.), and then output that processed information, either to graphs on the screen, or to new files.

## Repository layout

The existing Python applications and their tests live under `apps/legacy/`:

- `apps/legacy/module1/` through `apps/legacy/module4/` contain the applications.
- `apps/legacy/tests/` contains the cross-module regression checks.
- `documentation/` and `reference/` keep their existing locations.

Historical documents may show paths such as `module1/application/`. For the
current checkout, prefix those paths with `apps/legacy/`.

## Installation

### Prerequisites

Python 3.1 or greater


### Installation Steps

Each module under `apps/legacy/` has a main.py file that can be run in order to open the respective module, but for the sake of convenience, we have created executables for some of them in their application's 'dist' folder. These executables can be run without any prior installations.

In order to run a module without using an executable, you must first install the prerequisite modules. To do so, use pip to install the modules listed in the requirements.txt file in the relevant module's application folder. This can be done from the command line with the following command, if you are in that application folder:

> pip install -r requirements.txt


For modules 1–3, launch from the module's `application/mainUI` directory so
relative imports and UI resources resolve. For example, from the repository root:

```sh
cd apps/legacy/module1/application/mainUI
python main.py
```

For module 4, run `python main.py` from `apps/legacy/module4/application`.
Keep running PyInstaller from each module's `application` directory with its
existing `main.spec` file.

Run the capture-title regression check from the repository root with the Python
environment containing the legacy dependencies:

```sh
.venv/bin/python apps/legacy/tests/check_capture_titles.py
```

## Functionality

For modules 1-3, click import to select a file path for aquisition data. Press start to start plotting the data, or plot all to plot the data all at once. Press the mean bars button to bring up two verticle bars that can be used to select data segments. 

Module 4 can simply be run and will automatically create a folder with files containing the incoming data.

### Module 2: Ambit acquisition

Install Module 2's requirements, then open **File > Ambit acquisition**.
Choose or type the Ambit serial port and, for external LED commands, the
separate pulser serial port. Load a JSON protocol, enter the measured signal
offset, and select a new CSV file outside the mass-spectrometer acquisition
folder. Stop cancels the protocol and attempts to turn off both lights and stop
the instrument.

The protocol format follows the notebook's command lists. For example:

```json
[
  ["M", 10, 0.1, 0],
  ["W", 1],
  ["P"]
]
```

Notebook examples are in `apps/legacy/module2/application/protocols/`.
In **Load protocol**, browse to that folder and select
`signal_offset_protocol.json`: it requests 50 zero-actinic measurements at
0.1-second intervals. Use the resulting raw `S` values according to your lab's
baseline procedure; the application does not calculate the offset for you.

The `reference_only` subfolder contains the notebook's other examples,
including the expanded `Protocol_1`, `Protocol_2`, and `Protocol_5`. They are
preserved for reference, not approved for hardware use. Some exceed the
configured limits or supported intensity range and are rejected. If loading fails, the
previously selected protocol remains selected; check the displayed filename
before starting. The notebook's duplicated saturation-flash definitions are
represented by one file per distinct version.

`M` specifies count, interval in seconds, and Ambit actinic intensity; `W`
waits in seconds; `P` is accepted but the plot updates continuously.
`["A", "B", intensity]` and `["A", "R", intensity]` control the external
blue and red LEDs (0 turns a channel off). The Ambit actinic setting remains
on until another `M` step changes it or cleanup requests shutdown.

External LED exposure suggestions from the notebook are checked before and
during a run: intensities 1-49 have no time limit; 50-99 must remain below
120 seconds, 100-199 below 10 seconds, 200-499 below 2 seconds, and 500-1000
below 0.5 seconds. At overlapping notebook boundaries the shorter limit is
used. Each channel's continuous on-time is retained across intensity changes
and resets when switched off; no minimum cooldown is enforced. The built-in
Ambit accepts 0-255 and has no configured exposure limit. Researchers must
decide appropriate Ambit limits and cooldowns for their setup.

These are best-effort software safeguards, **not a hardware cutoff**. Timing,
serial operations, system stalls, disconnects, and shutdown failures can delay
or prevent switching a light off. Verify the setup, limits, and physical
shutdown with the instrument owner; do not assume measurement pulses or
independently operated lights are disabled.

Each Ambit row is saved immediately with its raw response, instrument time,
host UTC receipt time, offset, and calculated `(S - offset) / R`. A zero
reference is saved as raw data and stops the run with an error. Preserve the
mass-spectrometer's original timestamped acquisition/spool data separately:
Module 2's plotted mass data uses relative time, and this feature does not
synchronize the instruments. The UTC receipt time is not a hardware trigger
timestamp. Existing files are not overwritten.


## Contributing


1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## Additional Documentation



## License

MIT License
