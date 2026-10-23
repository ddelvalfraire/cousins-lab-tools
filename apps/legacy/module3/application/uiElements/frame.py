
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

from PyQt5 import QtWidgets
from PyQt5.QtWidgets import QSizePolicy, QFrame
from PyQt5.QtCore import *

class Frame(QtWidgets.QFrame):


    def __init__(self, scrollArea):
        super(Frame, self).__init__()

        self.scrollArea = scrollArea
        self.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Fixed)
        self.setMinimumHeight(int(0.9 * self.scrollArea.height()))
        self.setMinimumWidth(self.scrollArea.width())
        self.setFrameStyle(QFrame.Box | QFrame.Plain)

    def setFrameLayout(self, layout):
        self.setLayout(layout)
