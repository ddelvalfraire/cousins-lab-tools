
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

from PyQt5.QtCore import QObject, pyqtSignal
import PyQt5.QtCore as QtCore
from time import time
import sys
from math import floor

sys.path.insert(0, '../read_data')

from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton
from Code.Module_Main_1_3.Application.read_data.dataUtility import DataUtility

class PlotAllThread(QObject):

    finished = pyqtSignal()
    newDataPointSignal = pyqtSignal(list)
    throwOutOfDataExceptionSignal = pyqtSignal()
    throwFolderNotSelectedExceptionSignal = pyqtSignal()
    filesParsedSignal = pyqtSignal()
    secondsAt = QtCore.pyqtSignal(str)


    def __init__(self, globalObject):
        super(PlotAllThread, self).__init__()

        self.globalObject = globalObject
        self.sharedData = globalObject.sharedData


    def run(self):
        """Long running task"""
        try:
            if self.globalObject.application_state == "Idle":

                #### Signal to throw exception
                self.throwFolderNotSelectedExceptionSignal.emit()

            else:

                if not self.sharedData.folderAccessed:
                    self.sharedData.fileList.extend(DataUtility.getDataFileList())
                    self.sharedData.folderAccessed = True

                    ######### Signal to start to start file notifier thread.
                    self.filesParsedSignal.emit()

                # send per batch
                MAX_POINTS_PER_EMIT = 1_000  # tune to your rendering cost
                acc = []
                any_points_sent = False
                while True:
                    if self.globalObject.application_state == "Paused":
                        QtCore.QThread.msleep(100)
                        continue

                    batch = self.globalObject.dataObj.all()
                    if not batch:
                        if acc:
                            self.secondsAt.emit(str(floor(acc[-1][0])))
                            self.newDataPointSignal.emit(acc)
                            any_points_sent = True
                        if not any_points_sent:
                            self.throwOutOfDataExceptionSignal.emit()
                        break

                    if not acc:
                        # cheap update as we start accumulating
                        self.secondsAt.emit(str(floor(batch[-1][0])))

                    acc.extend(batch)
                    if len(acc) >= MAX_POINTS_PER_EMIT:
                        self.secondsAt.emit(str(floor(acc[-1][0])))
                        self.newDataPointSignal.emit(acc)
                        acc = []
                        any_points_sent = True

                if any_points_sent:
                    self.throwOutOfDataExceptionSignal.emit()
        finally:
            self.finished.emit()
