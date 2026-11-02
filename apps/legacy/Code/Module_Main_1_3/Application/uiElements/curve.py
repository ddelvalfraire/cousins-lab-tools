
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import sys
import PyQt5.QtWidgets as qtw
import PyQt5.QtCore as QtCore
import PyQt5.QtGui as qtg
import pyqtgraph as pg
import time
import numpy as np

# adding UI to the system path
sys.path.insert(0, '../read_data')

from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton

class Curve:

    def __init__(self, name, y, pen, graph):
        self.name = name
        if type(y) != list:
            print("something else was received")
        self.y = list(y)
        self.pen = pen
        self.points = SharedSingleton()
        with self.points.lock:
            # If y is provided during init, we should have matching x.
            # However, in this project y seems to be passed as an empty list [] usually.
            self.x = list(self.points.dataPoints.keys())[:len(self.y)]
        self.graph = graph
        self.isChecked = False
        self.firstPoint = False

    def plotCurve(self):
        
        self.data_line = pg.PlotDataItem(skipFiniteCheck=True, clipToView=True, useOpenGL=True)
        self.data_line.setPen(self.pen)
        self.graph.setClipToView(True)
        self.graph.addItem(self.data_line)


    def updateDataPoints(self, x, y):
        self.x += x
        self.y += y

        if self.isChecked == True:
            # Safety check: PyQtGraph will crash if lengths don't match.
            if len(self.x) == len(self.y):
                self.data_line.setData(x=self.x, y=self.y)
            else:
                import logging
                logging.getLogger(__name__).warning(
                    f"Skipping plot update for {self.name}: X({len(self.x)}) and Y({len(self.y)}) shape mismatch."
                )

            if self.firstPoint == False and len(x) > 0:
                # self.graph.plotItem.getViewBox().autoRange()
                # self.graph.setXRange(0, self.graph.xRange)
                # self.graph.setYRange(0, self.graph.yRange)
                self.xMax = x[-1]
                self.yMax = y[-1]
                self.firstPoint = True


    def hide(self):

        self.isChecked = False
        self.data_line.clear()

    def unhide(self):

        self.isChecked = True
        if len(self.x) == len(self.y):
            self.data_line.setData(x=self.x, y=self.y)
        else:
            import logging
            logging.getLogger(__name__).warning(
                f"Skipping unhide update for {self.name}: X({len(self.x)}) and Y({len(self.y)}) shape mismatch."
            )

    def clear(self):

        self.y = []
        self.x = []
        self.data_line.clear()
        


        
