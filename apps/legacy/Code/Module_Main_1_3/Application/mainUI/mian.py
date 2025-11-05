# Main function
import os

import PyQt5
from PyQt5 import QtCore, QtWidgets
from PyQt5.QtWidgets import QApplication

from module1 import LabViewModule1
# from module2 import LabViewModule2
# from module3 import LabViewModule3

def main(args):
    PyQt5.QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_EnableHighDpiScaling, True)
    PyQt5.QtWidgets.QApplication.setAttribute(QtCore.Qt.AA_UseHighDpiPixmaps, True)

    app = QApplication([])
    screen = app.primaryScreen()
    size = screen.availableGeometry()
    match args:
        case 1:
            labView = LabViewModule1(size.width(), size.height(), app)
        # case 2:
        #     labView = LabViewModule2(size.width(), size.height(), app)
        # case 3:
        #     labView = LabViewModule3(size.width(), size.height(), app)
        case _:
            labView = LabViewModule1(size.width(), size.height(), app)
    app.exec_()

if __name__ == "__main__":
    main(1)