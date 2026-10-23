
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""
import pandas as pd
import time as time
from sharedSingleton import SharedSingleton

class File:

    def __init__(self, fileName):
        
        self.fileName = fileName
        self.data = self.__openFile()
        self.sharedData = SharedSingleton()


    def __openFile(self):

        return pd.read_csv(self.fileName, header=None)


    def __iter__(self):
        pass

    def __next__(self):
        
        x_len = len(list(self.data.iloc[:,0]))
        if self.sharedData.initialX is None:
            self.sharedData.initialX = list(self.data.iloc[:,0])[0]/1000
        x = list(self.data.iloc[:,0])[x_len-1]/1000 - self.sharedData.initialX
        self.sharedData.xPoint = x


        y_mean_data = list(self.data.astype('float64').mean(axis=0))
        y_mean_data.pop(0)

        return x,y_mean_data
