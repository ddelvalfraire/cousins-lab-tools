
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


    def __init__(self, globalObject):
        super(PlotAllThread, self).__init__()

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

            all_points = []
            batch = self.globalObject.dataObj.all()
            while batch:
                all_points.extend(batch)
                batch = self.globalObject.dataObj.all()
            if not all_points:
                self.throwOutOfDataExceptionSignal.emit()
                return
            self.globalObject.stopwatch.set_elapsed_time(floor(all_points[-1][0]))
            self.newDataPointSignal.emit(all_points)
            self.globalObject.application_state = "Out_Of_Data"
            self.throwOutOfDataExceptionSignal.emit()

        self.finished.emit()
