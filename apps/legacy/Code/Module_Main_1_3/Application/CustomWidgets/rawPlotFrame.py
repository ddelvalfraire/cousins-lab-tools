from PyQt5 import QtWidgets, QtCore, QtGui
from PyQt5.QtGui import QMovie
from PyQt5.QtCore import Qt, QThread
import pyqtgraph as pg
import threading
import numpy as np
import logging
import pandas as pd

from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations

logger = logging.getLogger(__name__)

from Code.Module_Main_1_3.Application.mainUI.EzPlotAll import EzPlotAll
from Code.Module_Main_1_3.Application.mainUI.newFileNotifierThread import NewFileNotifierThread
from Code.Module_Main_1_3.Application.uiElements.frame import Frame
from Code.Module_Main_1_3.Application.uiElements.button import Button
from Code.Module_Main_1_3.Application.uiElements.graph import Graph
from Code.Module_Main_1_3.Application.uiElements.curve import Curve
from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton
from Code.Module_Main_1_3.Application.mainUI.plotAllThread import PlotAllThread

class RawPlotFrame(Frame):
    softError = QtCore.pyqtSignal((str,str))

    def __init__(self, scrollArea, heightFactor, stateVar, mode, parent=None, ):
        super(RawPlotFrame, self).__init__(scrollArea, heightFactor)
        self.parent = parent # LabViewModule1 instance
        self.sharedData = SharedSingleton()
        self.mode = mode

        self.sharedData.fileList = []
        self.sharedData.dataPoints = {}
        self.sharedData.folderAccessed = False
        self.sharedData.xPoint = 0
        self.sharedData.initialX = None

        # Data storage for raw plot
        self.startBit = False
        self.pauseBit = False
        self.yAllMax = None
        self.yAllMin = None
        self.isYChnaged = False
        self.currentXRange = None
        self.application_state = stateVar
        self.lofCurves = []
        self.lofCurvesRs = []
        self.initUI()
        self.addCurveAndMeanBar()

        self.EZViewPath = None
        self.folder_path = ''
        self.fileCheckThreadStarted = False

        self.point_counter = 0

    def initUI(self):
        ############################## Check Boxes Layout ##################################
        # Creating vertical layout for check boxes.
        self.checkBoxVLayout = QtWidgets.QVBoxLayout()

        if self.mode == 1:
            self.graph1CheckBox = QtWidgets.QCheckBox("Mass 32", self)
            self.graph1CheckBox.setStyleSheet("color: #800000")
            self.graph2CheckBox = QtWidgets.QCheckBox("Mass 34", self)
            self.graph2CheckBox.setStyleSheet("color: #9A6324")
            self.graph3CheckBox = QtWidgets.QCheckBox("Mass 36", self)
            self.graph3CheckBox.setStyleSheet("color: #808000")
            self.graph4CheckBox = QtWidgets.QCheckBox("Mass 44", self)
            self.graph4CheckBox.setStyleSheet("color: #4363d8")
            self.graph5CheckBox = QtWidgets.QCheckBox("Mass 45", self)
            self.graph5CheckBox.setStyleSheet("color: #e6194B")
            self.graph6CheckBox = QtWidgets.QCheckBox("Mass 46", self)
            self.graph6CheckBox.setStyleSheet("color: #911eb4")
            self.graph7CheckBox = QtWidgets.QCheckBox("Mass 47", self)
            self.graph7CheckBox.setStyleSheet("color: #42d4f4")
            self.graph8CheckBox = QtWidgets.QCheckBox("Mass 49", self)
            self.graph8CheckBox.setStyleSheet("color: #f58231")
            # Adding check boxes to the checkBoxWidget layout
            self.checkBoxVLayout.addWidget(self.graph1CheckBox)
            self.checkBoxVLayout.addWidget(self.graph2CheckBox)
            self.checkBoxVLayout.addWidget(self.graph3CheckBox)
            self.checkBoxVLayout.addWidget(self.graph4CheckBox)
            self.checkBoxVLayout.addWidget(self.graph5CheckBox)
            self.checkBoxVLayout.addWidget(self.graph6CheckBox)
            self.checkBoxVLayout.addWidget(self.graph7CheckBox)
            self.checkBoxVLayout.addWidget(self.graph8CheckBox)

            self.graph1CheckBox.setChecked(False)
            self.graph2CheckBox.setChecked(False)
            self.graph3CheckBox.setChecked(False)
            self.graph4CheckBox.setChecked(False)
            self.graph5CheckBox.setChecked(False)
            self.graph6CheckBox.setChecked(False)
            self.graph7CheckBox.setChecked(False)
            self.graph8CheckBox.setChecked(False)

        elif self.mode == 2:
            self.graph1CheckBox = QtWidgets.QCheckBox("Mass 32", self)
            self.graph1CheckBox.setStyleSheet("color: #800000")
            self.graph4CheckBox = QtWidgets.QCheckBox("Mass 44", self)
            self.graph4CheckBox.setStyleSheet("color: #4363d8")
            self.graph5CheckBox = QtWidgets.QCheckBox("Mass 45", self)
            self.graph5CheckBox.setStyleSheet("color: #e6194B")

            self.checkBoxVLayout.addWidget(self.graph1CheckBox)
            self.checkBoxVLayout.addWidget(self.graph4CheckBox)
            self.checkBoxVLayout.addWidget(self.graph5CheckBox)

            self.graph1CheckBox.setChecked(False)
            self.graph4CheckBox.setChecked(False)
            self.graph5CheckBox.setChecked(False)
        #############################################################################################

        ############################## BarButton, Rescale, Start Pause/Resume Slider Layout #############################

        # Mean Bar Button
        self.barsButton = Button("| |", 26, 26)
        self.plotAllButton = Button("Plot", 120, 26)

        # Pause/Resume Button
        self.pauseResumeButton = Button("Pause", 120, 26)

        # Rescale Button
        self.rescaleButton = Button("Rescale", 120, 26)

        # Line Of Best Fit Check Box
        self.lofCheckBox = QtWidgets.QCheckBox("Line Of Best Fit", self)
        self.lofCheckBox.setStyleSheet("color: #800000")
        self.lofCheckBox.setChecked(False)
        self.lineOfBestFitDraw = False
        self.lofCheckBox.clicked.connect(self.toggleLineOfBestFit, QtCore.Qt.QueuedConnection)

        self.processSpinnerLabel = QtWidgets.QLabel()
        self.processSpinnerLabel.setMinimumSize(QtCore.QSize(50, 50))
        self.processSpinnerLabel.setMaximumSize(QtCore.QSize(50, 50))

        self.movie = QMovie("spinner50px.gif")
        self.movie.jumpToFrame(0)
        self.processSpinnerLabel.setMovie(self.movie)
        self.processSpinnerLabel.hide()

        # Creating a Horizontal Layout for Start Pause/Resume and Slider
        self.rescaleStartPauseResumeSliderGridLayout = QtWidgets.QHBoxLayout()
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.processSpinnerLabel, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.barsButton, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.plotAllButton, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.rescaleButton, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.pauseResumeButton, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.lofCheckBox, 10, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.setSpacing(0)
        #############################################################################################

        ############################## {Graph} AND {Start Pause/Resume Slider Layout} ###############

        # Graph
        self.realTimeGraph = Graph(100, 100)
        self.realTimeGraph.setLabel(axis='left', text='Voltage (mV)')
        self.realTimeGraph.setLabel(axis='bottom', text='Time (s)')

        self.graphVLayout = QtWidgets.QVBoxLayout()
        self.graphVLayout.setContentsMargins(0, 0, 0, 0)
        self.graphVLayout.addWidget(self.realTimeGraph)

        # Layout for {Graph} AND {Start Pause/Resume Slider Layout}
        self.graphStartPauseResumeSliderVLayout = QtWidgets.QVBoxLayout()
        self.graphStartPauseResumeSliderVLayout.addLayout(self.graphVLayout)  # Widget containing graph
        self.graphStartPauseResumeSliderVLayout.addLayout(self.rescaleStartPauseResumeSliderGridLayout)  # Widget containing start pause/resume and slider

        ###############################################################################################

        ############### {Checkboxes} AND {{Graph} AND {Start Pause/Resume Slider Layout}} ###############

        self.rawDataPlotHLayout = QtWidgets.QHBoxLayout()
        self.setFrameLayout(self.rawDataPlotHLayout)
        self.rawDataPlotHLayout.addLayout(self.checkBoxVLayout)
        self.rawDataPlotHLayout.addLayout(self.graphStartPauseResumeSliderVLayout)

        ###############################################################################################
        self.connectSignals()

    def toggleLineOfBestFit(self):
        self.lineOfBestFitDraw = not self.lineOfBestFitDraw
        if self.lineOfBestFitDraw:
            self.lofCheckBox.setChecked(True)
        else:
            self.lofCheckBox.setChecked(False)
        self.drawLinesOfBestFit()

    def drawLinesOfBestFit(self):
        logging.debug("drawLinesOfBestFit - START")
        try:
            if self.lineOfBestFitDraw:
                # Remove old LOF lines
                logging.debug(f"Removing {len(self.lofCurves)} old LOF curves")
                for lofCurve in self.lofCurves:
                    self.realTimeGraph.removeItem(lofCurve)

                for lofCurveRs in self.lofCurvesRs:
                    self.realTimeGraph.removeItem(lofCurveRs)

                self.lofCurves = []
                self.lofCurvesRs = []

                # Get mean bar region
                region = self.meanBar.getRegion()
                region_start, region_end = region
                logging.debug(f"Mean bar region: {region_start} to {region_end}")

                for curve in self.curves:
                    if curve.isChecked:
                        logging.debug(f"Processing LOF for curve: {curve.name}")
                        x_arr = np.array(curve.x)
                        y_arr = np.array(curve.y)

                        # Mask for points in mean bar region
                        mask = (x_arr >= region_start) & (x_arr <= region_end)
                        x_region = x_arr[mask]
                        y_region = y_arr[mask]
                        logging.debug(f"Points in region for {curve.name}: {len(x_region)}")

                        if len(x_region) > 1:
                            # Calculate line of best fit (linear)
                            try:
                                # polyfit returns coefficients [slope, intercept] for degree 1
                                m, c = np.polyfit(x_region, y_region, 1)

                                # Define the line to span the region
                                lof_x = np.array([region_start, region_end])
                                lof_y = m * lof_x + c

                                # Create a temporary curve for the LOF line
                                color = QtGui.QColor(255, 255, 255, curve.pen.color().alpha())
                                pen = pg.mkPen(color=color, width=1, style=QtCore.Qt.DashLine)
                                lof_data_line = pg.PlotDataItem(lof_x, lof_y, pen=pen, antialias=True)
                                self.realTimeGraph.addItem(lof_data_line)
                                self.lofCurves.append(lof_data_line)

                                # rSqItem = pg.TextItem(f"r^2: {Calculations.rSquared(y_region, x_region):.4f}",
                                #                       anchor=(0.5, 0.5), color=color)
                                #
                                # self.realTimeGraph.addItem(rSqItem)
                                # rSqItem.setPos(lof_x[1], lof_y[1] + 2)
                                # self.lofCurvesRs.append(rSqItem)

                                logging.debug(f"Added LOF curve for {curve.name}")
                            except Exception as e:
                                logging.error(f"LOF calculation error for {curve.name}: {e}")
                                print(f"LOF calculation error for {curve.name}: {e}")
        except Exception as e:
            logging.error(f"Error in drawLinesOfBestFit: {e}")

        logging.debug("drawLinesOfBestFit - END")

    def addCurveAndMeanBar(self):
        # Adding the plot curves
        self.curve1 = Curve("Curve 1", [], pg.mkPen(color="#800000", width=4), self.realTimeGraph)
        self.curve1.plotCurve()

        self.curve2 = Curve("Curve 2", [], pg.mkPen(color="#9A6324", width=4), self.realTimeGraph)
        self.curve2.plotCurve()

        self.curve3 = Curve("Curve 3", [], pg.mkPen(color="#808000", width=4), self.realTimeGraph)
        self.curve3.plotCurve()

        self.curve4 = Curve("Curve 4", [], pg.mkPen(color="#4363d8", width=4), self.realTimeGraph)
        self.curve4.plotCurve()

        self.curve5 = Curve("Curve 5", [], pg.mkPen(color="#e6194B", width=4), self.realTimeGraph)
        self.curve5.plotCurve()

        self.curve6 = Curve("Curve 6", [], pg.mkPen(color="#911eb4", width=4), self.realTimeGraph)
        self.curve6.plotCurve()

        self.curve7 = Curve("Curve 7", [], pg.mkPen(color="#42d4f4", width=4), self.realTimeGraph)
        self.curve7.plotCurve()

        self.curve8 = Curve("Curve 8", [], pg.mkPen(color="#f58231", width=4), self.realTimeGraph)
        self.curve8.plotCurve()

        self.curves = [self.curve1, self.curve2, self.curve3, self.curve4, self.curve5, self.curve6, self.curve7, self.curve8]

        # Initializing the mean bars.
        self.meanBar = pg.LinearRegionItem(values=(0, 1), orientation='vertical', brush=None, pen=None,
                                           hoverBrush=None, hoverPen=None, movable=True, bounds=None,
                                           span=(0, 1), swapMode='sort', clipItem=None)

        # Adding the Mean bars when the plotting is paused
        self.realTimeGraph.addItem(self.meanBar)
        self.meanBar.sigRegionChangeFinished.connect(self.drawLinesOfBestFit, QtCore.Qt.QueuedConnection)

    def connectSignals(self):
        self.barsButton.clicked.connect(self.barsButtonPressed, QtCore.Qt.QueuedConnection)
        self.rescaleButton.clicked.connect(self.rescaleButtonPressed, QtCore.Qt.QueuedConnection)
        self.pauseResumeButton.clicked.connect(self.pauseResumeAction, QtCore.Qt.QueuedConnection)
        self.plotAllButton.clicked.connect(self.plotAllButtonPressed, QtCore.Qt.QueuedConnection)
        self.lofCheckBox.stateChanged.connect(self.lofCheckStateChanged, QtCore.Qt.QueuedConnection)

        if self.mode == 1:
            self.graph1CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph1CheckBox, self.curve1))
            self.graph2CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph2CheckBox, self.curve2))
            self.graph3CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph3CheckBox, self.curve3))
            self.graph4CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph4CheckBox, self.curve4))
            self.graph5CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph5CheckBox, self.curve5))
            self.graph6CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph6CheckBox, self.curve6))
            self.graph7CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph7CheckBox, self.curve7))
            self.graph8CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph8CheckBox, self.curve8))

        if self.mode == 2:
            self.graph1CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph1CheckBox, self.curve1))
            self.graph4CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph4CheckBox, self.curve4))
            self.graph5CheckBox.stateChanged.connect(
                lambda: self.graphCheckStateChanged(self.graph5CheckBox, self.curve5))

    def barsButtonPressed(self):
        xRange = self.realTimeGraph.getXAxisRange()
        scale = xRange[1] - xRange[0]
        midPoint = (xRange[1] + xRange[0]) / 2
        scale = int(scale / 10)
        self.meanBar.setRegion([midPoint - scale, midPoint + scale])

    def rescaleButtonPressed(self):
        try:
            x = list(self.sharedData.dataPoints.keys())[-1]
            self.realTimeGraph.setNewXRange(0, x)
            self.realTimeGraph.setNewYRange(0, 500)
        except:
            print("No data")
            pass

    def pauseResumeAction(self):
        # Pause the Plot
        if self.pauseBit == False:
            self.parent.application_state = "Paused"
            self.pauseBit = True
            self.pauseResumeButton.setText("Resume")
            self.pauseResumeButton.setToolTip('Resume the graph')

        # Resume the Plot
        elif self.pauseBit == True:
            self.parent.application_state = "Running"
            self.pauseBit = False
            self.pauseResumeButton.setText("Pause")
            self.pauseResumeButton.setToolTip('Pause the graph')

    def graphCheckStateChanged(self, checkBox, curve):
        if checkBox.isChecked():
            curve.unhide()
        else:
            curve.hide()

    def lofCheckStateChanged(self):
        if not self.lofCheckBox.isChecked():
            for lofCurve in self.lofCurves:
                self.realTimeGraph.removeItem(lofCurve)
            self.lofCurves = []

    def update_plot_data(self, dataPointsTemp):
        if not dataPointsTemp:
            return

        dataPoints = list(dataPointsTemp)
        logging.debug(f"update_plot_data - START (Points: {len(dataPoints)})")
        x_values = []
        y_values = [[], [], [], [], [], [], [], []]
        cloneData = dataPoints.copy()
        self.plot_n = 1
        # Protect dataPoints modification and sync with sharedData
        for dataPoint in dataPoints:
            x, y = dataPoint
            with self.sharedData.lock:
                self.sharedData.dataPoints[x] = y

            if self.point_counter % self.plot_n == 0:
                x_values.append(x)
                for i in range(len(y_values)):
                    y_values[i].append(y[i])
            self.point_counter += 1

        if not x_values:
            logging.debug("update_plot_data - END (No x_values)")
            return

        logging.debug(f"Updating curves with {len(x_values)} points")
        self.curve1.updateDataPoints(x_values, y_values[0])
        self.curve2.updateDataPoints(x_values, y_values[1])
        self.curve3.updateDataPoints(x_values, y_values[2])
        self.curve4.updateDataPoints(x_values, y_values[3])
        self.curve5.updateDataPoints(x_values, y_values[4])
        self.curve6.updateDataPoints(x_values, y_values[5])
        self.curve7.updateDataPoints(x_values, y_values[6])
        self.curve8.updateDataPoints(x_values, y_values[7])

        if self.mode == 2:
            logging.debug("Passing data to parent update_main_plot_data")
            self.parent.update_main_plot_data(cloneData)
        
        logging.debug("update_plot_data - END")

    def clearCurves(self):
        logging.debug("clearCurves - BEGIN")
        for curve in self.curves:
            curve.clear()
        
        for lofCurve in self.lofCurves:
            self.realTimeGraph.removeItem(lofCurve)
        self.lofCurves = []
        
        self.yAllMax = None
        self.yAllMin = None
        logging.debug("clearCurves - END")

    def plotAllButtonPressed(self):
        if self.folder_path == '' and self.EZViewPath == None:
            return
        if self.EZViewPath == None:
            self.LabViewPlotALl()
        else:
            self.EzViewPlotALl()

    def LabViewPlotALl(self):
        logging.debug("LabViewPlotALl - BEGIN")
        # cant plot all well started
        if self.parent.application_state == "Running":
            return

        if self.parent.application_state == "Out_Of_Data":
            return
        self.plotAllButton.setEnabled(False)
        self.processSpinnerLabel.show()
        self.movie.start()

        self.parent.application_state = "Running"
        self.pauseBit = False
        self.pauseResumeButton.setText("Pause")
        self.pauseResumeButton.setToolTip('Pause the graph')

        self.plotAllButtonThread = QThread(parent=self)
        # Step 3: Create a worker object
        self.plotAllThread = PlotAllThread(self.parent, self)

        # Step 4: Move worker to the thread
        self.plotAllThread.moveToThread(self.plotAllButtonThread)

        # Step 5: Connect signals and slots and start the stop watch
        self.plotAllButtonThread.started.connect(self.plotAllThread.run)

        self.plotAllButtonThread.start()

        title = self.windowTitle()
        self.plotAllThread.secondsAt.connect(lambda sec: self.parent.setWindowTitle(f"{title}: processing {sec}"))

        self.plotAllThread.newDataPointSignal.connect(
            self.update_plot_data, QtCore.Qt.QueuedConnection
        )
        self.plotAllThread.filesParsedSignal.connect(self.startNewFileNotifier)
        self.plotAllThread.throwFolderNotSelectedExceptionSignal.connect(
            lambda msg: self.softError.emit("plot all error", msg),
            QtCore.Qt.QueuedConnection
        )

        self.plotAllThread.finished.connect(self.endPlotAllThread)

    def EzViewPlotALl(self):
        logging.debug("EzViewPlotALl - BEGIN")
        # cant plot all well started
        if self.parent.application_state == "Running":
            return

        if self.parent.application_state == "Out_Of_Data":
            return
        self.plotAllButton.setEnabled(False)
        self.processSpinnerLabel.show()
        self.movie.start()

        self.parent.application_state = "Running"
        self.pauseBit = False
        self.pauseResumeButton.setText("Pause")
        self.pauseResumeButton.setToolTip('Pause the graph')

        self.plotAllButtonThread = QThread(parent=self)
        # Step 3: Create a worker object
        self.plotAllThread = EzPlotAll(self.parent, self)

        # Step 4: Move worker to the thread
        self.plotAllThread.moveToThread(self.plotAllButtonThread)

        # Step 5: Connect signals and slots and start the stop watch
        self.plotAllButtonThread.started.connect(self.plotAllThread.run)

        self.plotAllButtonThread.start()

        title = self.windowTitle()
        self.plotAllThread.secondsAt.connect(lambda sec: self.parent.setWindowTitle(f"{title}: processing {sec}"))

        self.plotAllThread.newDataPointSignal.connect(
            self.update_plot_data, QtCore.Qt.QueuedConnection
        )
        self.plotAllThread.filesParsedSignal.connect(self.startNewFileNotifier)
        self.plotAllThread.throwFolderNotSelectedExceptionSignal.connect(
            lambda msg: self.softError.emit("plot all error", msg))

        self.plotAllThread.finished.connect(self.endPlotAllThread)

    def startNewFileNotifier(self):

        if not self.fileCheckThreadStarted and self.folder_path != '':
            self.fileNotiferThread = QThread(parent=self.parent)
            # Step 3: Create a worker object
            self.newFileNotifierThread = NewFileNotifierThread(self.folder_path)
            # Step 4: Move worker to the thread
            self.newFileNotifierThread.moveToThread(self.fileNotiferThread)

            # Step 5: Connect signals and slots and start the stop watch
            self.fileNotiferThread.started.connect(self.newFileNotifierThread.run)

            self.fileNotiferThread.start()
            self.fileCheckThreadStarted = True

        else:
            pass

    def endPlotAllThread(self):
        logging.debug("endPlotAllThread - BEGIN")
        try:
            self.plotAllThread.stop()
            self.movie.stop()
            self.processSpinnerLabel.hide()
            self.plotAllButton.setEnabled(True)

            self.startBit = False
            self.pauseBit = True
            self.pauseResumeButton.setText("Resume")
            self.pauseResumeButton.setToolTip('Resume the graph')
        except Exception as exception:
            logging.error(f"Error in endPlotAllThread: {exception}")
            pass
        logging.debug("endPlotAllThread - END")

    def clear(self):
        logging.debug("RawPlotFrame.clear - BEGIN")
        self.clearCurves()
        self.plotAllButton.setEnabled(True)
        self.endPlotAllThread()
        self.fileCheckThreadStarted = False

        self.sharedData.fileList = []
        self.sharedData.dataPoints = {}
        self.sharedData.folderAccessed = False
        self.sharedData.xPoint = 0
        self.sharedData.initialX = None
        # Uncheck all the graph boxes.
        if self.mode == 1:
            self.graph1CheckBox.setChecked(False)
            self.graph2CheckBox.setChecked(False)
            self.graph3CheckBox.setChecked(False)
            self.graph4CheckBox.setChecked(False)
            self.graph5CheckBox.setChecked(False)
            self.graph6CheckBox.setChecked(False)
            self.graph7CheckBox.setChecked(False)
            self.graph8CheckBox.setChecked(False)
        elif self.mode == 2:
            self.graph1CheckBox.setChecked(False)
            self.graph4CheckBox.setChecked(False)
            self.graph5CheckBox.setChecked(False)
        logging.debug("RawPlotFrame.clear - END")

    def exportToCsv(self, path):
        """
        Exports the current plot data to a CSV file.
        :param path: The file path where the CSV file will be saved.
        """
        logging.debug(f"exportToCsv - START (Path: {path})")
        try:
            with self.sharedData.lock:
                data = self.sharedData.dataPoints.copy()

            if not data:
                logging.warning("exportToCsv - No data to export")
                return

            # Sort data by x-values (time/index)
            sorted_x = sorted(data.keys())
            
            # Prepare columns based on mode
            if self.mode == 1:
                columns = ["Time", "Mass 32", "Mass 34", "Mass 36", "Mass 44", "Mass 45", "Mass 46", "Mass 47", "Mass 49"]
            elif self.mode == 2:
                columns = ["Time", "Mass 32", "Mass 44", "Mass 45"]
            else:
                # Fallback if mode is unknown, use generic names
                num_y = len(next(iter(data.values())))
                columns = ["Time"] + [f"Value {i+1}" for i in range(num_y)]

            # Create rows for DataFrame
            rows = []
            for x in sorted_x:
                y_values = data[x]
                if self.mode == 2:
                    # For mode 2, we only have curves 1, 4, and 5 (indices 0, 3, 4 in the 8-value list)
                    # Assuming y_values always has 8 elements as initialized in update_plot_data
                    if len(y_values) >= 5:
                        rows.append([x, y_values[0], y_values[3], y_values[4]])
                    else:
                        rows.append([x] + list(y_values))
                else:
                    rows.append([x] + list(y_values))

            df = pd.DataFrame(rows, columns=columns)
            df.to_csv(path, index=False)
            logging.info(f"exportToCsv - Successfully exported to {path}")

        except Exception as e:
            logging.error(f"exportToCsv - Error: {e}")
            self.softError.emit("Export Error", f"Failed to export data to CSV: {e}")