# Main function
import PyQt5
from PyQt5 import QtCore, QtWidgets
from PyQt5.QtWidgets import QApplication, QSplashScreen
from PyQt5.QtGui import QPixmap

from module1 import LabViewModule1
from module2 import LabViewModule2
# from module3 import LabViewModule3

import sys
import traceback
import logging

# Configure logging
# Detect if running as a frozen PyInstaller bundle
is_frozen = getattr(sys, 'frozen', False)
log_level = logging.WARNING if is_frozen else logging.DEBUG

logging.basicConfig(
    filename='crash_report.log',
    level=log_level,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def exception_hook(exctype, value, tb):
    """Global exception handler for unhandled exceptions."""
    err_msg = "".join(traceback.format_exception(exctype, value, tb))
    logging.critical("Unhandled exception:\n" + err_msg)
    print(err_msg, file=sys.stderr)
    try:
        # Show error dialog if possible
        QtWidgets.QMessageBox.critical(None, "Fatal Error", f"An unhandled error occurred:\n{value}\n\nCheck crash_report.log for details.")
    except:
        pass
    sys.exit(1)

sys.excepthook = exception_hook

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