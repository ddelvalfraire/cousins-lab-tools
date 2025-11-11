
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import pandas as pd
from Code.Module_Main_1_3.Application.read_data.file import File
from Code.Module_Main_1_3.Application.read_data.dataUtility import DataUtility
from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton

class GetData:

    def __init__(self):
        self.currentFileIndex = -1
        self.numberOfFiles = None
        self.fileObj = None
        self.sharedData = SharedSingleton()
        print("fileLIst")

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
            # print(self.fileObj.data)
            # print(self.fileObj.all_vectors())
            # print(self.fileObj.__next__())
            # Once the file is opened:
            self.currentFileIndex += 1
            x,y = self.fileObj.__next__()
            # print(x,y)
            return (x,y)

    def all(self):
        fileList = self.sharedData.fileList
        self.numberOfFiles = len(fileList)

        if self.currentFileIndex == -1:
            self.currentFileIndex += 1

        if self.currentFileIndex >= self.numberOfFiles:
            return False

        self.fileObj = File(fileList[self.currentFileIndex])
        self.currentFileIndex += 1

        return self.fileObj.all()
