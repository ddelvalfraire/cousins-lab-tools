# Main function
import PyQt5
from PyQt5 import QtCore, QtWidgets
from PyQt5.QtWidgets import QApplication, QSplashScreen
from PyQt5.QtGui import QPixmap

from module1 import LabViewModule1
from module2 import LabViewModule2
# from module3 import LabViewModule3

def main(args):


    app = QApplication([])

    # --- Loading Screen Setup ---

    pixmap = QPixmap(r"Code/Module_Main_1_3/Application/mainUI/spinner50px.gif")
    splash = QSplashScreen(pixmap)
    splash.show()
    app.processEvents()
    # ----------------------------

    screen = app.primaryScreen()
    size = screen.size()

    labView = LabViewModule1(size.width(), size.height(), app)


    PyQt5.QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_EnableHighDpiScaling, True)
    PyQt5.QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_UseHighDpiPixmaps, True)

    labView.show()  # Ensure the main window is shown
    splash.finish(labView)  # Close splash screen when main window is ready

    app.exec_()

if __name__ == "__main__":
    main(2)