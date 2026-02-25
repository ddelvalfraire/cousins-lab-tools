import pandas as pd
from PyQt5.QtCore import QObject, pyqtSignal
import PyQt5.QtCore as QtCore
import sys
from math import floor
import struct
from datetime import datetime

sys.path.insert(0, '../read_data')

from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton
from Code.Module_Main_1_3.Application.read_data.dataUtility import DataUtility

class EzPlotAll(QObject):
    finished = pyqtSignal()
    newDataPointSignal = pyqtSignal(list)
    throwOutOfDataExceptionSignal = pyqtSignal()
    throwFolderNotSelectedExceptionSignal = pyqtSignal()
    filesParsedSignal = pyqtSignal()
    secondsAt = QtCore.pyqtSignal(str)

    def __init__(self, globalObject, rawPlotFrame):
        super(EzPlotAll, self).__init__()
        self.globalObject = globalObject
        self.rawPlotFrame = rawPlotFrame

    def run(self):
        try:
            if self.rawPlotFrame.EZViewPath == None:
                self.filesParsedSignal.emit()
                self.finished.emit()
                return

            MAX_POINTS_PER_EMIT = 1000
            acc = []
            any_points_sent = False
            print(self.rawPlotFrame.EZViewPath)
            isFirstline = True
            start_time = None

            with open(str(self.rawPlotFrame.EZViewPath), 'r') as file:
                while True:
                    if self.globalObject.application_state == 'Paused':
                        QtCore.QThread.msleep(100)
                        continue

                    hexChunk = ''
                    current_time = None
                    current_line = file.readline()

                    if isFirstline:
                        isFirstline = False
                        line_chunks = current_line.strip().split('\t')
                        start_time = datetime.strptime(line_chunks[0][:-4], '%m/%d/%y %H:%M:%S.%f')

                    while current_line and hexChunk[-8:] != 'ffffffff':
                        line_chunks = current_line.strip().split('\t')
                        if len(hexChunk) == 0:
                            current_time = datetime.strptime(line_chunks[0][:-4], '%m/%d/%y %H:%M:%S.%f')
                        hexChunk += line_chunks[1].strip()
                        current_line = file.readline()
                        if current_line == '':
                            QtCore.QThread.msleep(100)

                    hexString = hexChunk[-108:-8]
                    if len(hexString) == 100:
                        data = {
                            'time': int((current_time - start_time).total_seconds()),
                            'channel1': struct.unpack('!i', bytes.fromhex('0' + hexString[1:8]))[0] / 234800968 * 0.2,
                            'channel2': struct.unpack('!i', bytes.fromhex('0' + hexString[9:16]))[0] / 234800968 * 20.0,
                            'channel3': struct.unpack('!i', bytes.fromhex('0' + hexString[17:24]))[0] / 234800968 * 20.0,
                            'channel4': struct.unpack('!i', bytes.fromhex('0' + hexString[25:32]))[0] / 234800968 * 0.1,
                            'channel5': struct.unpack('!i', bytes.fromhex('0' + hexString[33:40]))[0] / 234800968 * 1.0,
                            'channel6': struct.unpack('!i', bytes.fromhex('0' + hexString[41:48]))[0] / 234800968 * 1.0,
                            'channel7': struct.unpack('!i', bytes.fromhex('0' + hexString[49:56]))[0] / 234800968 * 1.0,
                            'channel8': struct.unpack('!i', bytes.fromhex('0' + hexString[57:64]))[0] / 234800968 * 1.0,
                            'channel9': None,
                            'channel10': None,
                            'channel11': struct.unpack('!i', bytes.fromhex('0' + hexString[81:88]))[0] / 234800968 * 1.0,
                            'channel12': struct.unpack('!i', bytes.fromhex('0' + hexString[89:96]))[0] / 234800968 * 1.0,
                            'gainSetting': '0' + hexString[97:],
                            'index': [0]
                        }
                        # Based on instruction 2174-2246
                        # acc.extend([[data['time'], [-999, -999, -999, -999, data['channel1'], data['channel2'], -999, -999]]])
                        acc.extend([[data['time'], [-999, -999, -999, data['channel1'], data['channel2'], -999, -999, -999]]])
                        print(data['time'], [-1, -1, -1, -1, data['channel1'], data['channel2'], -1, -1])

                    if len(acc) >= MAX_POINTS_PER_EMIT:
                        self.secondsAt.emit(str(floor(acc[-1][0])))
                        self.newDataPointSignal.emit(acc)
                        acc = []
                        any_points_sent = True

        finally:
            if not any_points_sent:
                self.throwOutOfDataExceptionSignal.emit()
            self.finished.emit()
