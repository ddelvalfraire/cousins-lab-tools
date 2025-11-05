
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

        # If th plotting of the graph is not paused
        if self.globalObject.pauseBit == False and self.globalObject.startBit == True:

            # If the condition is true, this means either the program is reading the data for the first time
            # or there was no more data read hence, this function will send just a single point by calling __next__
            
            #(X, [Y1, Y2, Y3....])

            dataPoints = []

            if len(self.lastDataPoint) == 0:
                
                # Keep getting data until 'out of data' or 'valid data'
                dataPoint = self.globalObject.dataObj.__next__()
                if self.isDataPointValid(dataPoint):
                    # print(dataPoint)
                    self.lastDataPoint = dataPoint
                    if self.firstFlag == False:
                        self.anchorTime = self.lastDataPoint[0]
                        self.firstFlag = True


            stopwatch_time = self.globalObject.stopwatch.get_elapsed_time()

            # print((self.lastDataPoint[0]*1000 + self.globalObject.delay), (stopwatch_time + self.anchorTime))
            while len(self.lastDataPoint) > 0 and (self.lastDataPoint[0]*1000 + self.globalObject.delay) <= (stopwatch_time + self.anchorTime):
                # print(self.lastDataPoint[0]*1000 + self.globalObject.delay, self.globalObject.stopwatch.get_elapsed_time() + self.anchorTime)
                dataPoint = self.globalObject.dataObj.__next__()
                # print(dataPoint)

                if self.isDataPointValid(dataPoint):
                    dataPoints.append(self.lastDataPoint)
                    # print(dataPoints)

                    dataPoint = self.globalObject.dataObj.__next__()
                    # print(dataPoint)

                    if self.isDataPointValid(dataPoint):
                        self.lastDataPoint = dataPoint

                    else:
                        break

                else:
                    break

            if len(dataPoints) > 0:
                # print(dataPoints)
                # print("Break")
                self.newDataPointSignal.emit(dataPoints)

            else:
                return
            


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
