
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

sys.path.insert(0, '../read_data')

from Code.Module_Main_1_3.Application.read_data.sharedSingleton import  SharedSingleton
from Code.Module_Main_1_3.Application.read_data.dataUtility import DataUtility

class Worker(QObject):

    finished = pyqtSignal()
    newDataPointSignal = pyqtSignal(list)
    plotEndBitSignal = pyqtSignal()
    filesParsedSignal = pyqtSignal()


    def __init__(self, globalObject):
        super(Worker, self).__init__()
        self.globalObject = globalObject
        self.lastDataPoint = tuple()
        self.anchorTime = None
        self.firstFlag = False


    def run(self):

        """Long running task"""

        # change-file-reading
        # The run function of the thread will read the directory and get all the files for once.
        # The files read will be stored in the singleton class.
        # Then it will send a signal to the main thread that the directory has been read once.
        sharedData = SharedSingleton()

        if not sharedData.folderAccessed:
            sharedData.fileList.extend(DataUtility.getDataFileList())
            sharedData.folderAccessed = True
            self.filesParsedSignal.emit()
        # else:
        #     sharedData.fileList = DataUtility.getDataFileList()
        #     self.filesParsed.emit()

        # Setting the timer after which the graph will be updated.
        self.timer = QtCore.QTimer()
        self.timer.setInterval(self.globalObject.delay)
        self.timer.timeout.connect(self.getNextPoint)
        self.timer.start()

        if not self.timer.isActive():
            self.finished.emit()



    def getNextPoint(self):

        """
            Gets the next data point from the row of the file.
            :param {_ : }
            :return -> None
        """
        # Generator for getting the next data point
        if self.globalObject.application_state == "Paused":
            return

        if len(self.lastDataPoint) == 0:
            data = self.globalObject.dataObj.all()
            if self.isDataPointValid(data):
                self.lastDataPoint = data
                if not self.firstFlag:
                    # anchor to first x from the first point of the batch
                    self.anchorTime = self.lastDataPoint[0][0]
                    self.firstFlag = True
            else:
                # nothing to do yet
                return

        stopwatch_time = self.globalObject.stopwatch.get_elapsed_time()

        # Emit when synthetic time reached first timestamp in batch
        while (len(self.lastDataPoint) > 0 and (self.lastDataPoint[0][0] * 1000 + self.globalObject.delay) <= (stopwatch_time + self.anchorTime)):

            # Push to UI
            dataPoints = self.lastDataPoint
            # Try to load next
            next_batch = self.globalObject.dataObj.all()
            if self.isDataPointValid(next_batch):
                self.lastDataPoint = next_batch
            else:
                self.lastDataPoint = []
                break

            break

        if 'dataPoints' in locals() and len(dataPoints) > 0:
            self.newDataPointSignal.emit(dataPoints)
            


    def isDataPointValid(self, dataPoint):
        #  if dataPoint is tuple
        if dataPoint is False or dataPoint is None:
            return False
        #  if dataPoint is a list of tuples
        if isinstance(dataPoint, list):
            return len(dataPoint) > 0
        #  else
        return True
