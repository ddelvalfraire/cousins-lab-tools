
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import os
import re

class DataUtility:

    @staticmethod
    def setDataDirectory(filePath):
        # os.chdir("../Data/Acquisition-1111/Acquisition-1111")
        os.chdir(filePath)
        cwd = os.getcwd()
        return cwd

    @staticmethod
    def getDataFileList():
        fileList = os.listdir()
        if ".DS_Store" in fileList:
            fileList.remove(".DS_Store")
        # print(fileList)
        fileList.sort(key=lambda var:[int(x) if x.isdigit() else x for x in re.findall(r'[^0-9]|[0-9]+', var)])
        return fileList
