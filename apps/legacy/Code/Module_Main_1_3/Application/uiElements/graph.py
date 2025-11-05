
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import pyqtgraph as pg
from PyQt5.QtCore import QEvent
from PyQt5.QtCore import Qt

class Graph(pg.PlotWidget):


    def __init__(self, xRange, yRange):
        super(Graph, self).__init__()

        self.showGrid(x=True, y=True)
        self.setBackground('black')
        self.xRange = xRange
        self.yRange = yRange
        self.setXRange(0, xRange)
        self.setYRange(0, yRange)
        self.plotItem.hideButtons()
        self.graphInteraction = False

        # self.plotItem.ctrlMenu = None

    def mouseMoveEvent(self, event):

        if event.buttons() == Qt.RightButton:

            # consume the event and return without doing anything
            event.accept()
            return
        
        elif event.buttons() == Qt.LeftButton:

            self.graphInteraction = True
            event.accept()

        # call the base class implementation
        super().mouseMoveEvent(event)

    def contextMenuEvent(self, event):

        self.graphInteraction = True
        super().contextMenuEvent(event)

    
    def getXAxisRange(self):
        return self.plotItem.getAxis("bottom").range
        
    def getYAxisRange(self):
        return self.plotItem.getAxis("left").range

    def setNewXRange(self, start, end):
        self.setXRange(start, end)

    def setNewYRange(self, start, end):
        self.setYRange(start, end)
