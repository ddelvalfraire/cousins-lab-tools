
import pandas as pd
from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton
import logging

logger = logging.getLogger(__name__)


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
        with self.sharedData.lock:
            if self.sharedData.initialX is None:
                self.sharedData.initialX = list(self.data.iloc[:,0])[0]/1000
            x = list(self.data.iloc[:,0])[x_len-1]/1000 - self.sharedData.initialX
            self.sharedData.xPoint = x


        y_mean_data = list(self.data.astype('float64').mean(axis=0))
        y_mean_data.pop(0)

        return x,y_mean_data

    def all(self):
        try:
            # x values
            x_series = self.data.iloc[:, 0].astype('float64') / 1000.0

            with self.sharedData.lock:
                if self.sharedData.initialX is None:
                    self.sharedData.initialX = list(self.data.iloc[:,0])[0]/1000
                x_values = (x_series - self.sharedData.initialX).tolist()

            # y as list of lists
            y_rows = self.data.iloc[:, 1:].astype('float64').values.tolist()

            return list(zip(x_values, y_rows))
        except:
            return False