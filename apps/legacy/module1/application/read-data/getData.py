
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import pandas as pd
from  file import File
from dataUtility import DataUtility
from sharedSingleton import SharedSingleton

class GetData:

    def __init__(self):
        self.currentFileIndex = -1
        self.numberOfFiles = None
        self.fileObj = None
        self.sharedData = SharedSingleton()

    def setDirectory(self, filePath):
        DataUtility.setDataDirectory(filePath)

    def __iter__(self):
        self.currentFileIndex = -1

    def __next__(self):
        
        # change-file-reading
        # instead of reading the file list again and again, get it from the shared list.
        fileList = self.sharedData.fileList
        self.numberOfFiles = len(fileList)

        # Reading the first ever file from the folder.
        if self.currentFileIndex ==-1:
            self.currentFileIndex += 1

        # If folder is out of files to be read.
        if self.currentFileIndex >= self.numberOfFiles:
            return False
        
        else:

            self.fileObj = File(fileList[self.currentFileIndex])
            
            # Once the file is opened:
            self.currentFileIndex += 1
            x,y = self.fileObj.__next__()
            # print(x,y)
            return (x,y)
                
