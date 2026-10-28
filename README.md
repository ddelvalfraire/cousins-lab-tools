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


## Contributing


1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## Additional Documentation



## License

MIT License
