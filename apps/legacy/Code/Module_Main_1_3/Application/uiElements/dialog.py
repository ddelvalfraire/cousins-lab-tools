
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import sys

from PyQt5.QtWidgets import QDialog, QDialogButtonBox, QVBoxLayout, QLabel
from PyQt5 import QtCore

class Dialog(QDialog):

    def __init__(self, title, buttonCount, message, parent=None):
        
        super().__init__(parent)

        # Disabling the close, maximize and minimize window options

        # enable custom window hint
        self.setWindowFlags(self.windowFlags() | QtCore.Qt.CustomizeWindowHint)

        # disable (but not hide) close button
        self.setWindowFlags(self.windowFlags() & ~QtCore.Qt.WindowCloseButtonHint)

        #Setting the window title
        self.setWindowTitle(title)

        if buttonCount == 1:
            QBtn = QDialogButtonBox.Ok
        
        elif buttonCount == 2:
            QBtn = QDialogButtonBox.Ok | QDialogButtonBox.Cancel

        elif buttonCount == 3:
            QBtn = QDialogButtonBox.No | QDialogButtonBox.Yes

        self.buttonBox = QDialogButtonBox(QBtn)

        self.layout = QVBoxLayout()
        label = QLabel(message)
        self.layout.addWidget(label)
        self.layout.addWidget(self.buttonBox)
        self.setLayout(self.layout)
