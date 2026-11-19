
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

class CurveModule3:

    def __init__(self, name, y, pen, graph):
        self.name = name
        if type(y) != list:
            print("something else was received")
        self.y = y
        self.pen = pen
        self.points = SharedSingleton()
        self.x = list(self.points.da49data.keys())
        self.graph = graph
        self.isChecked = False
        self.firstPoint = False

    def plotCurve(self):
        
        self.data_line = pg.PlotDataItem(skipFiniteCheck=True, clipToView=True, useOpenGL=True)
        self.data_line.setPen(self.pen)
        self.graph.setClipToView(True)
        self.graph.addItem(self.data_line)


    def updateDataPoints(self, x, y):

        self.y += y
        self.x = list(self.points.da49data.keys())

        if self.isChecked == True:

            self.data_line.setData(x=self.x, y=self.y)

            if self.firstPoint == False:
                self.graph.plotItem.getViewBox().autoRange()
                self.graph.setXRange(0, self.graph.xRange)
                self.graph.setYRange(0, self.graph.yRange)
                self.xMax = x
                self.yMax = y
                self.firstPoint = True


    def hide(self):

        self.isChecked = False
        self.data_line.clear()

    def unhide(self):

        self.isChecked = True
        self.data_line.setData(x=self.x, y=self.y)

    def clear(self):

        self.y = []
        self.x = []
        self.isChecked = False
        self.firstPoint = False
        if hasattr(self, 'data_line'):
            self.data_line.clear()
            self.data_line.setData(x=[], y=[])
        


        
