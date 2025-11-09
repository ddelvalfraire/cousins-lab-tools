
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

        # list of (time, (m1, m2, ...)) holds all data points from one file
        self.currentBatch = []

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
        if self.globalObject.pauseBit or not self.globalObject.startBit:
            return

        if not self.currentBatch:
            self.currentBatch = self.globalObject.dataObj.all()
            if not self.currentBatch:
                # Out of data
                self.timer.stop()
                self.globalObject.stopwatch.pause()
                self.plotEndBitSignal.emit()
                self.finished.emit()
                return
            if not self.firstFlag:
                self.anchorTime = self.currentBatch[0][0]
                self.firstFlag = True

        dataPoints = []

        stopwatch_time = self.globalObject.stopwatch.get_elapsed_time()

        while True:
            while self.currentBatch and (self.currentBatch[0][0] * 1000 + self.globalObject.delay) <= (
                    stopwatch_time + self.anchorTime):
                dataPoints.append(self.currentBatch.pop(0))

            if dataPoints or self.currentBatch:
                break

            self.currentBatch = self.globalObject.dataObj.all()
            if not self.currentBatch:
                # No more files
                if dataPoints:
                    self.newDataPointSignal.emit(dataPoints)
                self.timer.stop()
                self.globalObject.stopwatch.pause()
                self.plotEndBitSignal.emit()
                self.finished.emit()
                return

        if dataPoints:
            self.newDataPointSignal.emit(dataPoints)
            


    def isDataPointValid(self, dataPoint):

        # If the value is false this means OUT OF DATA
            
        if dataPoint == False:
            # print("No more data points to read")
            self.timer.stop()
            self.globalObject.stopwatch.pause()
            self.plotEndBitSignal.emit()
            self.finished.emit()
            return False
        
        else:
            return True
