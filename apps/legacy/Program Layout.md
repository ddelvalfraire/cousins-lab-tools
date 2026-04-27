# Program Info
This is a multigroup long project so there is some built in strangeness with that lake of communication.
module 1 and 2 are complete built and working, module 3 has not been touched but should be moved into module main 1_3 (all modules use to be their own folder but there was a lot of duplicated code, so to make it so improvement to one would span to the others). There is a bunch of logging in the code to help track down a few crashes that have now been fixed. The mainModules detect if it's an exe (the "frozen" bool) and if not will add those logs to the crash report file.
## Data 
- Data stores test data and programs that simulate the machines Acquisition output and ezview output. 
- They program is built to read data from two machines, First is one that produces Acq folders, one per "experimental run" a new ~10 line csv file is added to the program every ~1 second are labeled Acquisition-number, these are read and processed by PlotAllThread. Second is a machine that produces an EZView (with the help of a program they have) one file per experimental run, this file get appended line by line with encode hexocode which is decoded by EzViewPlot all.
- Calabrations: save calabration data that is loaded in the program, not cross combatable between mod 1 and 2
## Build
- run the build.bat bash file
- or:
1. to download all requirements: pip install -r Code/Module_Main_1_3/Application/requirements.txt
2. To build: run from outside the code folder: pyinstaller --name LabView_module_1 --onefile --windowed --paths . --paths Code\Module_Main_1_3\Application\mainUI\MainAndBuildFiles\mianMoudle1.py --add-data "Code\Module_Main_1_3\Application\mainUI\spinner50px.gif;Code/Module_Main_1_3/Application/mainUI"
3. Replace the 1's with 2's to build module 2

## Outline
- Calculations: a simple staticmethod class that stores commonly used calculations
- Custom Widgets: Pyqt is a widget and event based GUI, The program is made up of "layouts" which store widgets, like buttons which are tied to even that trigger methods. 
  - rawPlotFrame: this reads, processes, stores and displays the raw data gotten from the files.
  - customCalculatonPlot: this runs and displays a custom calculations, only used in module 1
- MainAndBuildFiles: the programs main files that should be run to run the relative module
  - mainMoudle1: Runs module 1 
  - mainMoudle2: Runs module 2
- mainUI: stores the files that run the main ui, plus som stuff that should be removed
  - module1: The UI layout for module 1, combines display custom widget, and build structure to nit them together, as wells as having other structures that probable should be moved to helper classes.
  - module2: same as 1 but for module 2, allot simpler and more streamlined
- Read_Data: reads the machines data
  - dataUtility: some helper function not really used anymore
  - file: read file data and store file info
  - getData: read the files in the selected folder for acq mode
  - ReadEZView: old file that kept around as it contain lost info on how to decode ezview files
  - sharedSingleton: a storage object that used to store info cross class and cross thread, it was implemented by the old team and the program should be rewritten to not use it.
- uiElements: Default widget structure that should be used in place of the widget they represent to keep ui consented, but no code require them be used.
  - button: we clicked triggers set targeted events.
  - curve: a line on a graph.
  - CurveModule3: curve but from module 3, as we did not combine module 3 into the program structure it remains, should be combined with curve
  - dialog: pop up text box, with built in buttons.
  - frame: widget/sub-frame holder, manly used as they have built in features like rescaling or scrolling.
  - graph: the graph ui elements
  - LineEdit: imputable text boxes.
- Workers: classes that do computation work, generally should not directly interact with ui, are usually run on separate threads
  - ExportWorks: Exports modules customCalculationsPlots table to an excel file
  - EzPlotAll: Converts the Ezview files into data to be saved and plotted, run continuously and updates as the file get added to, can be tested with Data/Test Data/EZviewTest.py
  - newFileNotifier: reads the Acq folder and updates when a new file gets added to that folder.
  - plotAllThread: plots an acq folder, updates automatically when the files gets added, can be tested with Data/Test Data/simulate.py
  - SamplePlotCalcWorker: handles the calculations for SamplePlot.
  