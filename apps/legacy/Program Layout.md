# Program Info
This is a multigroup long project so their is some built in strangeness with that lake of communication.
module 1 and 2 are complete buit and working, module 3 has not been touched but should be moved into module main 1_3 (all modules use to be their own folder but their was allot of duplicxated code, so to make it so improvement to one would spain to the others)
## Data 
-> Data stores test data and programs that simulate the machines Acquisition output and ezview output
## Build
- run the build.bat bash file
- or:
1. to download all requirements: pip install -r Code/Module_Main_1_3/Application/requirements.txt
2. To build: run from outside the code folder: pyinstaller --name LabView_module_1 --onefile --windowed --paths . --paths Code Code\Module_Main_1_3\Application\mainUI\MainAndBuildFiles\mianMoudle1.py --add-data "Code\Module_Main_1_3\Application\mainUI\spinner50px.gif;Code/Module_Main_1_3/Application/mainUI"
3. Replace the 1's with 2's to build moudle 2

## Outline
- Calculations; a simple staticmethod class that stores commole used calculations
- Custom Widgets: Pyqt is a widget and event based GUI, The program is made up of "layouts" wich store widgets, like buttons which are tied to even that trigger methods. 
  - rawPlotFrame: this reads, processes, stores and displays the raw data gotten from the files.
  - customCalculatonPlot: this runs and displays a custom calculatons, only used in moudle 1
- MainAndBuildFiles: the programs main files that should be run to run the relitive moudle
  - mainMoudle1: Runs module 1 
  - mainMoudle2: Runs module 2
- mainUI: stores the files that run the main ui, plus som stuff that should be removed
  - module1: The UI layout for module 1, combines display custom widget, and build structure to nit them together, as wells as having other structures that probable should be moved to helper classes.
  - moudle2: same as 1 but for module 2, allot simpler and more streamlined
- Read_Data: reads the machines data
  - dataUtility: some helper function not really used anymore
  - file: read file data and store file info
  - getData: read the files in the selected folder for acq mode
  - ReadEZView: old file that kept around as it contain lost info on how to decode ezview files