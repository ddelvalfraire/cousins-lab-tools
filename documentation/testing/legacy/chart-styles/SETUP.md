# Chart styles test setup

Preconditions shared by the test cases in this folder.

## Build

Test the Windows executables from the release candidate being tested, listed on
the [Releases page](https://github.com/ddelvalfraire/cousins-lab-tools/releases).

## Test data

From the repository root:

```sh
python apps/legacy/tools/simulate.py --interval 0
python apps/legacy/tools/EZviewTest.py --interval 0
```

- Acquisition folder: `apps/legacy/tools/output/acquisition` (Acquisition-4971)
- EZView file: `apps/legacy/tools/output/EZView_DataCopy.txt`

Without `--interval 0`, the acquisition replay takes about 20 minutes.

## Reset saved settings

Close the module, then delete its settings file if it exists:

- Module 1: `%APPDATA%\CousinsLab\module1.ini`
- Module 2: `%APPDATA%\CousinsLab\module2.ini`
