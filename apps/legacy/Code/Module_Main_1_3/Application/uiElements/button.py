
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

from PyQt5 import QtWidgets
from PyQt5.QtWidgets import QPushButton, QFrame, QSizePolicy
from PyQt5.QtCore import *

class Button(QtWidgets.QPushButton):

    def __init__(self, text, width, height):
        super(Button, self).__init__()

        self.setText(text)
        self.setMinimumWidth(width)
        self.setMinimumHeight(height)
        self.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)
        
    
    def setMargins(self, l, t, r, b):
        self.setContentsMargins(l, t, r, b)
