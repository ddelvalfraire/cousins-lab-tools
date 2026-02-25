from PyQt5 import QtWidgets, QtCore
from PyQt5.QtGui import QMovie
from PyQt5.QtCore import Qt, QThread
import pyqtgraph as pg
import threading
from math import floor

from Code.Module_Main_1_3.Application.mainUI.EzPlotAll import EzPlotAll
from Code.Module_Main_1_3.Application.uiElements.frame import Frame
from Code.Module_Main_1_3.Application.uiElements.button import Button
from Code.Module_Main_1_3.Application.uiElements.graph import Graph
from Code.Module_Main_1_3.Application.uiElements.curve import Curve
from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton
from Code.Module_Main_1_3.Application.mainUI.worker import Worker
from Code.Module_Main_1_3.Application.mainUI.plotAllThread import PlotAllThread

class RawPlotFrame(Frame):
    softError = QtCore.pyqtSignal((str,str))

    def __init__(self, scrollArea, heightFactor, stateVar, mode, parent=None, ):
        super(RawPlotFrame, self).__init__(scrollArea, heightFactor)
        self.parent = parent # LabViewModule1 instance
        self.sharedData = SharedSingleton()
        self.mode = mode
        # Data storage for raw plot
        self.startBit = False
        self.pauseBit = False
        self.yAllMax = None
        self.yAllMin = None
        self.isYChnaged = False
        self.currentXRange = None
        self.application_state = stateVar

        self.initUI()
        self.addCurveAndMeanBar()

        self.EZViewPath = None

    def initUI(self):
        ############################## Check Boxes Layout ##################################
        # Initializing all the graphs
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

        # Initially all the graphs checkboxes should be checked.
        self.graph1CheckBox.setChecked(False)
        self.graph2CheckBox.setChecked(False)
        self.graph3CheckBox.setChecked(False)
        self.graph4CheckBox.setChecked(False)
        self.graph5CheckBox.setChecked(False)
        self.graph6CheckBox.setChecked(False)
        self.graph7CheckBox.setChecked(False)
        self.graph8CheckBox.setChecked(False)

        # Creating vertical layout for check boxes.
        self.checkBoxVLayout = QtWidgets.QVBoxLayout()

        if self.mode == 1:
            # Adding check boxes to the checkBoxWidget layout
            self.checkBoxVLayout.addWidget(self.graph1CheckBox)
            self.checkBoxVLayout.addWidget(self.graph2CheckBox)
            self.checkBoxVLayout.addWidget(self.graph3CheckBox)
            self.checkBoxVLayout.addWidget(self.graph4CheckBox)
            self.checkBoxVLayout.addWidget(self.graph5CheckBox)
            self.checkBoxVLayout.addWidget(self.graph6CheckBox)
            self.checkBoxVLayout.addWidget(self.graph7CheckBox)
            self.checkBoxVLayout.addWidget(self.graph8CheckBox)
        elif self.mode == 2:
            # Adding check boxes to the checkBoxWidget layout
            self.checkBoxVLayout.addWidget(self.graph1CheckBox)
            self.checkBoxVLayout.addWidget(self.graph4CheckBox)

        #############################################################################################

        ############################## BarButton, Rescale, Start Pause/Resume Slider Layout #############################

        # Mean Bar Button
        self.barsButton = Button("| |", 26, 26)
        self.plotAllButton = Button("Plot", 120, 26)

        # Pause/Resume Button
        self.pauseResumeButton = Button("Pause", 120, 26)

        # Rescale Button
        self.rescaleButton = Button("Rescale", 120, 26)

        self.processSpinnerLabel = QtWidgets.QLabel()
        self.processSpinnerLabel.setMinimumSize(QtCore.QSize(50, 50))
        self.processSpinnerLabel.setMaximumSize(QtCore.QSize(50, 50))

        self.movie = QMovie("spinner50px.gif")
        self.movie.jumpToFrame(0)
        self.processSpinnerLabel.setMovie(self.movie)
        self.processSpinnerLabel.hide()

        # Create labels for each tick value
        self.hTickbox = QtWidgets.QHBoxLayout()
        self.speedLabels = [".05x", "2x", "4x", "6x", "8x", "10x", "12x", "14x", "16x", "18x", "20x", "22x",
                            "24x", "26x", "28x", "30x", "32x"]
        for label in self.speedLabels:
            tickLabel = QtWidgets.QLabel(label, self)
            self.hTickbox.addWidget(tickLabel)


        self.hTickbox.setSpacing(30)

        # Creating a Horizontal Layout for Start Pause/Resume and Slider
        self.rescaleStartPauseResumeSliderGridLayout = QtWidgets.QHBoxLayout()
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.processSpinnerLabel, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.barsButton, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.plotAllButton, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.rescaleButton, 0, Qt.AlignmentFlag.AlignLeft)
        self.rescaleStartPauseResumeSliderGridLayout.addWidget(self.pauseResumeButton, 10, Qt.AlignmentFlag.AlignLeft)
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

        # Initializing the mean bars.
        self.meanBar = pg.LinearRegionItem(values=(0, 1), orientation='vertical', brush=None, pen=None,
                                            hoverBrush=None, hoverPen=None, movable=True, bounds=None,
                                            span=(0, 1), swapMode='sort', clipItem=None)

        # Adding the Mean bars when the plotting is paused
        self.realTimeGraph.addItem(self.meanBar)

    def connectSignals(self):
        self.barsButton.clicked.connect(self.barsButtonPressed)
        self.rescaleButton.clicked.connect(self.rescaleButtonPressed)
        self.pauseResumeButton.clicked.connect(self.pauseResumeAction)

        self.plotAllButton.clicked.connect(self.plotAllButtonPressed)

        self.graph1CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph1CheckBox, self.curve1))
        self.graph2CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph2CheckBox, self.curve2))
        self.graph3CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph3CheckBox, self.curve3))
        self.graph4CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph4CheckBox, self.curve4))
        self.graph5CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph5CheckBox, self.curve5))
        self.graph6CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph6CheckBox, self.curve6))
        self.graph7CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph7CheckBox, self.curve7))
        self.graph8CheckBox.stateChanged.connect(lambda: self.graphCheckStateChanged(self.graph8CheckBox, self.curve8))

    def barsButtonPressed(self):
        xRange = self.realTimeGraph.getXAxisRange()
        scale = xRange[1] - xRange[0]
        midPoint = (xRange[1] + xRange[0]) / 2
        scale = int(scale / 10)
        self.meanBar.setRegion([midPoint - scale, midPoint + scale])

    def rescaleButtonPressed(self):
        if self.realTimeGraph.graphInteraction == False:
            return
        elif self.realTimeGraph.graphInteraction == True:
            self.isYChnaged = True
            self.realTimeGraph.graphInteraction = False

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

    def update_plot_data(self, dataPoints):
        y_value = [[], [], [], [], [], [], [], []]
        while len(dataPoints) != 0:
            dataPoint = dataPoints.pop(0)
            x, y = dataPoint
            self.sharedData.dataPoints[x] = y
            for i in range(len(y_value)):
                y_value[i].append(y[i])

        yAllMax = max(y)
        yAllMin = min(y)

        if self.yAllMin == None and self.yAllMax == None:
            self.yAllMax = yAllMax
            self.yAllMin = yAllMin
            self.isYChnaged = True
        else:
            if yAllMin < self.yAllMin:
                self.yAllMin = yAllMin
                self.isYChnaged = True
            if yAllMax > self.yAllMax:
                self.yAllMax = yAllMax
                self.isYChnaged = True

        self.changeGraphRange(x)

        self.curve1.updateDataPoints(x, y_value[0])
        self.curve2.updateDataPoints(x, y_value[1])
        self.curve3.updateDataPoints(x, y_value[2])
        self.curve4.updateDataPoints(x, y_value[3])
        self.curve5.updateDataPoints(x, y_value[4])
        self.curve6.updateDataPoints(x, y_value[5])
        self.curve7.updateDataPoints(x, y_value[6])
        self.curve8.updateDataPoints(x, y_value[7])

    def changeGraphRange(self, x):
        self.currentXRange = self.realTimeGraph.getXAxisRange()
        if x > self.currentXRange[1]:
            currentXScale = self.currentXRange[1] - self.currentXRange[0]
            self.currentXRange = [self.currentXRange[0] + currentXScale, self.currentXRange[1] + currentXScale]
            if not self.realTimeGraph.graphInteraction:
                self.realTimeGraph.setNewXRange(self.currentXRange[0], self.currentXRange[1])

        if self.isYChnaged:
            if not self.realTimeGraph.graphInteraction:
                offsetMin = (20 * self.yAllMin) / 100
                offsetMax = (20 * self.yAllMax) / 100
                self.realTimeGraph.setNewYRange(self.yAllMin - offsetMin, self.yAllMax + offsetMax)
                self.isYChnaged = False

    def clearCurves(self):
        self.curve1.clear()
        self.curve2.clear()
        self.curve3.clear()
        self.curve4.clear()
        self.curve5.clear()
        self.curve6.clear()
        self.curve7.clear()
        self.curve8.clear()
        self.yAllMax = None
        self.yAllMin = None

    def plotAllButtonPressed(self):
        if self.EZViewPath == None:
            self.LabViewPlotALl()
        else:
            self.EzViewPlotALl()

    def LabViewPlotALl(self):
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
        self.plotAllThread = PlotAllThread(self.parent)

        # Step 4: Move worker to the thread
        self.plotAllThread.moveToThread(self.plotAllButtonThread)

        # Step 5: Connect signals and slots and start the stop watch
        self.plotAllButtonThread.started.connect(self.plotAllThread.run)

        self.plotAllButtonThread.start()

        title = self.windowTitle()
        self.plotAllThread.secondsAt.connect(lambda sec: self.parent.setWindowTitle(f"{title}: processing {sec}"))

        self.plotAllThread.newDataPointSignal.connect(self.update_plot_data)
        self.plotAllThread.throwFolderNotSelectedExceptionSignal.connect(
            lambda msg: self.softError.emit("plot all error", msg))

        self.plotAllThread.finished.connect(self.endPlotAllThread)
        self.plotAllThread.finished.connect(self.plotAllThread.deleteLater)

    def EzViewPlotALl(self):
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

        self.plotAllThread.newDataPointSignal.connect(self.update_plot_data)
        self.plotAllThread.throwFolderNotSelectedExceptionSignal.connect(
            lambda msg: self.softError.emit("plot all error", msg))

        self.plotAllThread.finished.connect(self.endPlotAllThread)

    def endPlotAllThread(self):

        self.movie.stop()
        self.processSpinnerLabel.hide()
        self.plotAllButtonThread.quit()
        self.plotAllButtonThread.wait()
        self.plotAllButtonThread.deleteLater()
        self.plotAllButton.setEnabled(True)

        self.startBit = False
        self.pauseBit = True
        self.pauseResumeButton.setText("Resume")
        self.pauseResumeButton.setToolTip('Resume the graph')

    def clear(self):
        self.clearCurves()

        # Uncheck all the graph boxes.
        self.graph1CheckBox.setChecked(False)
        self.graph2CheckBox.setChecked(False)
        self.graph3CheckBox.setChecked(False)
        self.graph4CheckBox.setChecked(False)
        self.graph5CheckBox.setChecked(False)
        self.graph6CheckBox.setChecked(False)
        self.graph7CheckBox.setChecked(False)
        self.graph8CheckBox.setChecked(False)