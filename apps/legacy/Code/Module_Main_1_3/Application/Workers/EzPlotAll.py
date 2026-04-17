from datetime import datetime

from PyQt5.QtCore import QObject, pyqtSignal
import PyQt5.QtCore as QtCore
import sys
from math import floor
import struct

sys.path.insert(0, '../read_data')

import logging
logger = logging.getLogger(__name__)

class EzPlotAll(QObject):
    """
    Read an Ezview output file and contentiously returns the new data added to it.
    """
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
        self._is_running = True

    def stop(self):
        self._is_running = False

    def run(self):
        logger.debug("EzPlotAll.run - BEGIN")
        try:
            if self.rawPlotFrame.EZViewPath == None:
                self.filesParsedSignal.emit()
                self.finished.emit()
                return
            # determines how often point get plotted, lower cause more lag when loading an old file, higher provide more responsive system.
            MAX_POINTS_PER_EMIT = 10
            acc = []

            isFirstline = True
            start_time = None

            with open(str(self.rawPlotFrame.EZViewPath), 'r') as file:
                while self._is_running:
                    if self.globalObject.application_state == 'Paused':
                        QtCore.QThread.msleep(100)
                        continue

                    hexChunk = ''
                    current_time = None
                    current_line = file.readline()

                    if isFirstline:
                        # sets start time
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
                            # if reached the end of file
                            MAX_POINTS_PER_EMIT = 1
                            # time.sleep(0.5)
                            QtCore.QThread.msleep(100)
                            current_line = file.readline()
                            continue

                    # Processing of hexdata was done by prevuise team and they left no info on what its doing by it works.
                    # channels dont nessacarle mean mass number, only conformed 3 = m44, 1 = m45
                    hexString = hexChunk[-108:-8]
                    if len(hexString) == 100:
                        data = {
                            'time': (current_time - start_time).total_seconds(),
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

                        # returns required data, all others are unsed
                        acc.extend([[data['time'], [-404.404,    # unkown
                                                    -404.404,    # unkown
                                                    -404.404,    # unkown
                                                    data['channel3'],    # mass 44
                                                    data['channel1'],    # mass 45
                                                    -404.404,    # unkown
                                                    -404.404,    # unkown
                                                    -404.404]]]) # unkown

                    if len(acc) >= MAX_POINTS_PER_EMIT:
                        # sends data to plots
                        self.secondsAt.emit(str(floor(acc[-1][0])))
                        self.newDataPointSignal.emit(acc)
                        acc = []

        finally:
            logger.debug("EzPlotAll.run - END")
            self.finished.emit()
