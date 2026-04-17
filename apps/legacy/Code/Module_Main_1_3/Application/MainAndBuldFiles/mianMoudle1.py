# Main function
import PyQt5
from PyQt5 import QtCore, QtWidgets
from PyQt5.QtWidgets import QApplication, QSplashScreen
from PyQt5.QtGui import QPixmap

from module1 import LabViewModule1


import sys
import traceback
import logging

# Configure logging
# Detect if running as a frozen PyInstaller bundle
is_frozen = getattr(sys, 'frozen', False)
log_level = logging.WARNING if is_frozen else logging.DEBUG
try:
    if not is_frozen:
        logging.basicConfig(
            filename='crash_report.log',
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
except Exception as e:
    # If file is locked or other error, fallback to stderr
    print(f"Warning: Failed to initialize logging to file: {e}", file=sys.stderr)
    logging.basicConfig(level=log_level, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

logging.info(f"Application starting (Frozen: {is_frozen}, Log Level: {logging.getLevelName(log_level)})")

def exception_hook(exctype, value, tb):
    """Global exception handler for unhandled exceptions."""
    err_msg = "".join(traceback.format_exception(exctype, value, tb))
    logging.critical("Unhandled exception:\n" + err_msg)
    print(err_msg, file=sys.stderr)
    try:
        pass
        # Show error dialog if possible
        # QtWidgets.QMessageBox.critical(None, "Fatal Error", f"An unhandled error occurred:\n{value}\n\nCheck crash_report.log for details.")
    except:
        pass

sys.excepthook = exception_hook

def main():


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
    main()