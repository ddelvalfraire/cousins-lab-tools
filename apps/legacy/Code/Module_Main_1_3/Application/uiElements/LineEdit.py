
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""
from PyQt5.QtWidgets import QLineEdit

class LineEdit(QLineEdit):

    def __init__(self, parent=None):

        super().__init__(parent)

        # make line edit ReadOnly by default
        self.setReadOnly(True)
