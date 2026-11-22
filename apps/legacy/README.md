# Legacy instrument tools

Python applications for mass spectrometers and plant respiration research in the WSU Cousins Plant Biology Lab.

## Modules

- **Modules 1 and 2:** mass-spectrometer applications with acquisition-folder and EZView input, plots, mean bars, calibration, sample results, and exports. Module 1 also includes a calculations view and all-data session save/load.
- **Module 3:** visualizes mass-spectrometer data.
- **Module 4:** reformats data from a secondary mass spectrometer and creates a folder of output files when run.

## Start with the researcher workflow

Read the [user manual](https://ddelvalfraire.github.io/cousins-lab-tools/) for importing data, plotting, mean bars, calibration, results, and export. Each manual page identifies the application versions it covers.

The [Windows Module 1 and 2 release candidate](https://github.com/ddelvalfraire/cousins-lab-tools/releases/tag/legacy-v0.2.0-rc.2) contains `LabView_module_1.exe` and `LabView_module_2.exe`. The applications use Windows document-folder conventions.

## Setup and launch from source

Install the dependencies for the module you want to run.

### Modules 1 and 2

From the repository root:

```sh
cd apps/legacy
python -m pip install -r Code/Module_Main_1_3/Application/requirements.txt
python -m Code.Module_Main_1_3.Application.MainAndBuildFiles.mainModule1
```

For Module 2, replace `mainModule1` with `mainModule2`.

Run from `apps/legacy` so the `Code` package resolves. To build Windows executables, install `requirements-build.txt`, then run `build.bat` from that directory. The executables are written to `apps/legacy/dist`.

### Try the Ambit UI without hardware

From `apps/legacy`, run:

```sh
python -m tools.simulate_ambit
```

The simulation opens the real Ambit dialog with simulated Ambit and pulser
ports, a 15-second example protocol, and an offset of zero. Click **Connect
and start**, then choose a new CSV filename. The plot fluctuates as synthetic
measurements arrive. You can load another JSON protocol or stop a run early.
Only the simulated ports can be opened in this process; the normal Module 2
launcher still uses real hardware. Each synthetic CSV row includes
`SIMULATED:1` in its raw response. Simulated values are not scientific data.

### Modules 3 and 4

For Module 3, start from the repository root:

```sh
python -m pip install -r apps/legacy/module3/application/requirements.txt
cd apps/legacy/module3/application/mainUI
python main.py
```

For Module 4, start from the repository root:

```sh
cd apps/legacy/module4/application
python -m pip install -r requirements.txt
python main.py
```

For Modules 3 and 4, run PyInstaller from the relevant `application` directory using its `main.spec` file.

## Regression check

From the repository root, with the legacy dependencies installed in `.venv`:

```sh
.venv/bin/python apps/legacy/tests/check_capture_titles.py
```

Manual test cases for Modules 1 and 2 are in [documentation/testing](../../documentation/testing/).

## Historical paths

Older documentation may refer to standalone `module1/application/` and `module2/application/` folders. Modules 1 and 2 now share the code under `apps/legacy/Code/Module_Main_1_3/`. Project reports and history remain in [documentation](../../documentation/).
