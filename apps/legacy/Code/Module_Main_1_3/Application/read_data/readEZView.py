import pandas as pd
import matplotlib.pyplot as plt
import struct
import numpy as np
from numpy import blackman
import datetime
import os
from datetime import datetime
import time


def read_from_ezview(folderPath, spool_path):
    def df_column_switch(df, column1, column2):
        i = list(df.columns)
        a, b = i.index(column1), i.index(column2)
        i[b], i[a] = i[a], i[b]
        df = df[i]
        return df

    try:

        if spool_path:
            print("Selected file:", spool_path)
        else:
            print("No file selected")

        spool_file = open(spool_path,"r")

        # Initialize dataframe
        df = pd.DataFrame({'time': [], 
                                'channel1':    [],
                                'channel2':    [],
                                'channel3':    [],
                                'channel4':    [],
                                'channel5':    [],
                                'channel6':    [],
                                'channel7':    [],
                                'channel8':    [],
                                'channel9':    [],
                                'channel10':   [],
                                'channel11':   [],
                                'channel12':   [],
                                'gainSetting': []})

        start_time = datetime.now()

        current = df.copy()

        fileCount = 0 #counts amount of files created (for naming purposes)

    
        #raise Exception()
        while True:
            # find "ff ff ff ff"
            hexChunk = ''
            current_time = None
            current_line = spool_file.readline()
            while current_line and hexChunk[-8:] != 'ffffffff':
                line_chunks = current_line.strip().split('\t')
                if len(hexChunk) == 0:
                    # Parse the first chunk of current line into a datetime object, ignoring the nanoseconds
                    current_time = datetime.strptime(line_chunks[0][:-4], "%m/%d/%y %H:%M:%S.%f")
                hexChunk += line_chunks[1].strip()

                current_line = spool_file.readline()
                if current_line == '':
                    time.sleep(0.5)

            # print(hexChunk)

            hexString = hexChunk[-108:-8]
            # print("hexString: ", hexString)
            
            if len(hexString) == 100:
                # Store data in Pandas dataframe
                newCurrent = pd.DataFrame({ 'time':        int((current_time - start_time).total_seconds()*1000), 
                                            'channel1':    struct.unpack('!i', bytes.fromhex('0'+hexString[1:8]))[0] / 234800968 * 0.2,
                                            'channel2':    struct.unpack('!i', bytes.fromhex('0'+hexString[9:16]))[0] / 234800968 * 20.0,
                                            'channel3':    struct.unpack('!i', bytes.fromhex('0'+hexString[17:24]))[0] / 234800968 * 20.0,
                                            'channel4':    struct.unpack('!i', bytes.fromhex('0'+hexString[25:32]))[0] / 234800968 * 0.1,
                                            'channel5':    struct.unpack('!i', bytes.fromhex('0'+hexString[33:40]))[0] / 234800968 * 1.0,
                                            'channel6':    struct.unpack('!i', bytes.fromhex('0'+hexString[41:48]))[0] / 234800968 * 1.0,
                                            'channel7':    struct.unpack('!i', bytes.fromhex('0'+hexString[49:56]))[0] / 234800968 * 1.0,
                                            'channel8':    struct.unpack('!i', bytes.fromhex('0'+hexString[57:64]))[0] / 234800968 * 1.0,
                                            'channel9':    np.nan,
                                            'channel10':   np.nan,
                                            'channel11':   struct.unpack('!i', bytes.fromhex('0'+hexString[81:88]))[0] / 234800968 * 1.0,
                                            'channel12':   struct.unpack('!i', bytes.fromhex('0'+hexString[89:96]))[0] / 234800968 * 1.0,
                                            'gainSetting': '0'+hexString[97:]}, index=[0])


                newCurrent = newCurrent.round(3)
                current = pd.concat([current, newCurrent])
            
            

            if len(current.index) >= 1: # row count
                #write current to csv
                #directoryPath = r'C:/Users/brayden.groshong/Workspace/Acquisition/'
                filePath = folderPath + "/" + str(fileCount) + ".csv"
                #print("writing csv: ", filePath)
                current = current.drop(current.columns[[9, 10, 13]], axis=1)  # df.columns is zero-based pd.Index

                # must reorder some columns
                #   channel 1 = mass 45
                #   channel 3 = mass 44

                #   in module 1, 
                #   curve 5 = mass 45
                #   curve 4 = mass 44

                #   must swap
                #   channel 1, channel 5
                #   channel 3, channel 4
                #print("before", current)
                current = df_column_switch(current, 'channel1', 'channel5')
                current = df_column_switch(current, 'channel3', 'channel4')
                #print("after", current)
                current.to_csv(filePath, header=False, index=False)
                current = df.copy()
                fileCount += 1

    except Exception as e:
        print(e)

