echo Starting Build
pyinstaller --name LabView_module_1 --onefile --windowed --paths . --paths Code Code/Module_Main_1_3/Application/MainAndBuildFiles/mianMoudle1.py --add-data "Code\Module_Main_1_3\Application\mainUI\spinner50px.gif;Code/Module_Main_1_3/Application/mainUI"

pyinstaller --name LabView_module_2 --onefile --windowed --paths . --paths Code Code/Module_Main_1_3/Application/MainAndBuildFiles/mianMoudle2.py --add-data "Code\Module_Main_1_3\Application\mainUI\spinner50px.gif;Code/Module_Main_1_3/Application/mainUI"
Echo Done