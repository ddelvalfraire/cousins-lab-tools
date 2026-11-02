"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import sys
from math import floor

from PyQt5 import QtCore
from PyQt5.QtCore import QObject, pyqtSignal

sys.path.insert(0, "../read-data")

from dataUtility import DataUtility
from sharedSingleton import SharedSingleton


class PlotAllThread(QObject):
    finished = pyqtSignal()
    newDataPointSignal = pyqtSignal(list)
    throwOutOfDataExceptionSignal = pyqtSignal()
    throwFolderNotSelectedExceptionSignal = pyqtSignal()
    filesParsedSignal = pyqtSignal()

    def __init__(self, globalObject):
        super().__init__()

        self.globalObject = globalObject
        self.sharedData = SharedSingleton()

    def run(self):
        """Long running task"""

        if self.globalObject.application_state == "Idle":
            #### Signal to throw exception
            self.throwFolderNotSelectedExceptionSignal.emit()

        else:
            if not self.sharedData.folderAccessed:
                self.sharedData.fileList.extend(DataUtility.getDataFileList())
                self.sharedData.folderAccessed = True

                ######### Signal to start to start file notifier thread.
                self.filesParsedSignal.emit()

            dataPoints = []
            dataPoint = self.globalObject.dataObj.__next__()

            if not dataPoint:
                ##### Singal to throw exception
                self.throwOutOfDataExceptionSignal.emit()
                return

            else:
                while dataPoint:
                    if QtCore.QThread.currentThread().isInterruptionRequested():
                        self.finished.emit()
                        return
                    dataPoints.append(dataPoint)
                    dataPoint = self.globalObject.dataObj.__next__()

                self.globalObject.stopwatch.set_elapsed_time(floor(dataPoints[-1][0]))

                #### Send singal to update the data point.
                self.newDataPointSignal.emit(dataPoints)

                self.globalObject.application_state == "Out_Of_Data"  # noqa: B015 - no-op, probably meant "="; fixing it changes behavior

                #### Send signal to throw exception.
                self.throwOutOfDataExceptionSignal.emit()

        self.finished.emit()
