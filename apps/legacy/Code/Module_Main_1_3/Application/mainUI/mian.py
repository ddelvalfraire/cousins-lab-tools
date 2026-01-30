# Main function
import PyQt5
from PyQt5 import QtCore, QtWidgets
from PyQt5.QtWidgets import QApplication, QSplashScreen
from PyQt5.QtGui import QPixmap

from module1 import LabViewModule1
# from module2 import LabViewModule2
# from module3 import LabViewModule3

def main(args):
    PyQt5.QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_EnableHighDpiScaling, True)
    PyQt5.QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_UseHighDpiPixmaps, True)

    app = QApplication([])

    # --- Loading Screen Setup ---

    pixmap = QPixmap(r"Code/Module_Main_1_3/Application/mainUI/spinner50px.gif")
    splash = QSplashScreen(pixmap)
    splash.show()
    app.processEvents()
    # ----------------------------

    screen = app.primaryScreen()
    size = screen.size()

    match args:
        case 1:
            labView = LabViewModule1(size.width(), size.height(), app)
        # case 2:
        #     labView = LabViewModule2(size.width(), size.height(), app)
        # case 3:
        #     labView = LabViewModule3(size.width(), size.height(), app)
        case _:
            labView = LabViewModule1(size.width(), size.height(), app)

    labView.show()  # Ensure the main window is shown
    splash.finish(labView)  # Close splash screen when main window is ready

    app.exec_()

if __name__ == "__main__":
    main(1)