
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

# from PyQt5.uic import loadUi
from PyQt5 import QtWidgets, QtCore
from PyQt5.QtWidgets import QApplication, QSizePolicy, QMainWindow, QMenuBar, QFileDialog, QAction
from PyQt5.QtWidgets import QSizePolicy, QDialogButtonBox
from PyQt5.QtWidgets import QSizePolicy
from PyQt5.QtGui import QMovie

import pyqtgraph as pg
import sys, os, csv
import threading
from worker import Worker
from newFileNotifierThread import NewFileNotifierThread
from PyQt5.QtCore import Qt, QObject, QThread, pyqtSignal, QSize
import numpy as np
from time import time
from datetime import datetime
from math import floor
from plotAllThread import PlotAllThread


#####################################################################

# 1. Idle (When the application is started and no data folder is selected.)
# 2. Selected (Data folder is selected but thread is not running)
# 3. Running (Thread is Running and data is plotting)
# 4. Paused (Application is paused)
# 5. Out_Of_Data (Application is out of data and is idle. Thread also ended.)

#####################################################################

# adding read_data to the system path
sys.path.append('../read_data')

# adding uiElements to the system path
sys.path.append('../uiElements')

# adding read_data to the system path
sys.path.append('../calculations')

from Code.Module_Main_1_3.Application.read_data.getData import GetData
from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton
from Code.Module_Main_1_3.Application.uiElements.curve import Curve
from Code.Module_Main_1_3.Application.uiElements.graph import Graph
from Code.Module_Main_1_3.Application.uiElements.frame import Frame
from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations
from Code.Module_Main_1_3.Application.uiElements.button import Button
from Code.Module_Main_1_3.Application.uiElements.dialog import Dialog
from Code.Module_Main_1_3.Application.uiElements.LineEdit import LineEdit
from Code.Module_Main_1_3.Application.read_data.readEZView import read_from_ezview
from Code.Module_Main_1_3.Application.CustomWidgets.rawPlotFrame import RawPlotFrame
from Code.Module_Main_1_3.Application.CustomWidgets.customCalculatoinPlot import customCalculationPlot

class LabViewModule2(QtWidgets.QMainWindow):

    def __init__(self, width, height, app):
        """
        This method initializes the LabView class.
        This is where we initialize values and call the methods that create the User Interface
        """
        super(LabViewModule2, self).__init__()

        self.app = app
        self.screen_width = width
        self.screen_height = height

        self.setGeometry(0, 0, width, height)
        # self.setMinimumSize(int(width//2), int(width//2))

        # get current user's username
        self.user = os.getlogin()

        # Setting varibales that will be used for the logic
        self.setWindowTitle("LabView")

        self.firstPoint = False

        #self.yRealMax = None
        #self.yRealMin = None
        #self.isRealYChanged = False

        self.yMinList = [None, None, None]
        self.yMaxList = [None, None, None]
        self.isYChanged = [False, False, False]

        self.application_state = "Idle"

        # List of UI elements
        self.lineEditList = []

        # Dictionaries to hold data for graphs
        self.assayBufferData = {}
        self.hclData = {}
        self.o2VelocityConcentrationData = {}
        self.co2VelocityConcentrationData = {}

        # Initialize O2 and CO2 Calibrations
        self.temperature = 0
        self.o2Calibration = 0
        self.co2BufferCalibration = 0
        self.co2HCLCalibration = 0
        self.biCarbCo2Ratio = 0

        # Initialize CO2 and O2 Blank values
        self.co2Blank = 0
        self.o2Blank = 0

        # Initialize CO2 and O2 Extract values
        self.co2Extract = 0
        self.o2Extract = 0

        #Initialize CO2 and O2 net rate of consumption
        self.co2ConsumptionRate = 0
        self.o2ConsumptionRate = 0

        # Initialize CO2 and O2 rate of consumption and concentrations
        self.percentCO2 = 0
        self.uBarCO2 = 0

        self.co2Zero44Reading = 0
        self.co2SampleReading = 0

        self.lastUbar = 0
        
        # Initialize O2 calibration and measurements
        self.o2Temperature = 0
        self.o2Air = 0
        self.o2Calibration = 0
        
        self.o2Zero = 0
        self.o2Measured = 0
        self.uBarO2 = 0
        
        self.keepCals = False

        # Data Object for getting the points.
        self.dataObj = GetData()

        # Initialize scroll area
        self.initializeScrollArea()

        # Initialzie the QFrames
        self.initializeQFrames()

        # Initializing calculation plot
        self.calculatedPlotsUI()

        # Initializing calculation buttons
        self.calculationButtonsUI()

        # List of calibration line edits
        self.calibrationLineEdits = [self.temperatureLineEdit, self.o2ZeroLineEdit, self.o2TemperatureLineEdit, self.o2CalibrationLineEdit,
                                     self.o2AverageLineEdit, self.co2CalZeroLineEdit, self.co2Cal1ulLineEdit, self.co2Cal2ulLineEdit,
                                     self.co2Cal3ulLineEdit
                                    ]

        # Add curves and Mean bar to the real time plot
        self.addCurveAndMeanBar()

        # Connect UI to Methods
        self.connectUItoMethods()

        self.show()

#################################################################################################################################
################################################# User Interface Creation #################################################
    """
    The user interface is broken up into three frames:
    - one frame for the raw data plot (rawDataPlotUI)
    - one for the calculated plots(calculatedPlotsUI)
    - one for the calculation buttons and table (calculationButtonsUI)

    For each frame, we create the user interface elements(graphs/plots, buttons, line edits, labels, checkboxes, etc.)
    We then have to add these elements to layouts 
    Layouts are then added to the frame.

    Other UI creation methods
    - initializeScrollArea: Give app ability to scroll
    - initializeQFrames: Initializes the frames mentioned above
    - addCurveAndMeanBar: Adds the 8 data stream curves to the raw data plot, creates the mean bars
    - connectUItoMethods: Connects the UI elements to methods - tells the program what to do when a UI element is interacted with

    """

    def calculatedPlotsUI(self):

        ###################################### QFormLayout for Assay Buffer #####################################

        # Widgets to be added in the layout
        self.intercept1Label = QtWidgets.QLabel("Intercept")
        self.co2VoltLabel = QtWidgets.QLabel("CO2/Voltage (ml/mV)")
        self.assayBufferLabel = QtWidgets.QLabel("CO2 Calibrations")
        self.emptyLabel = QtWidgets.QLabel("")

        self.intercept1LineEdit = LineEdit()
        self.co2VoltLineEdit = LineEdit()
        
        self.lineEditList.extend([self.intercept1LineEdit, self.co2VoltLineEdit])

        self.assayBufferBoxGridLayout = QtWidgets.QGridLayout()
        #self.assayBufferBoxGridLayout.addWidget(self.emptyLabel, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.intercept1Label, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.co2VoltLabel, 1, 3, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.assayBufferLabel, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.intercept1LineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.co2VoltLineEdit, 2, 3, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.setHorizontalSpacing(10)
        ###############################################################################################

        ###################################### QFormLayout for uBar and DuBar #####################################

        # Widgets to be added in the layout
        self.uBarGraphLabel = QtWidgets.QLabel("Pressure")
        self.DuBarGraphLabel = QtWidgets.QLabel("Pressure Derivative")

        self.uBarBoxGridLayout = QtWidgets.QGridLayout()
        #self.uBarBoxGridLayout.addWidget(self.emptyLabel, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.uBarBoxGridLayout.addWidget(self.uBarGraphLabel, 2, 1, alignment=QtCore.Qt.AlignCenter)

        self.DuBarBoxGridLayout = QtWidgets.QGridLayout()
        #self.DuBarBoxGridLayout.addWidget(self.emptyLabel, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.DuBarBoxGridLayout.addWidget(self.DuBarGraphLabel, 2, 1, alignment=QtCore.Qt.AlignCenter)

        ###############################################################################################



        ######################## {QFormLayout for Assay Buffer} AND {Assay Buffer Graph} #######################

        self.assayBufferGraph = Graph(180, 3)
        self.assayBufferGraph.setLabel(axis='left', text = 'CO2 (µL)')
        self.assayBufferGraph.setLabel(axis='bottom', text = 'Voltage (mV)')
        self.assayBufferGraph.getViewBox().wheelEvent = self.on_wheel_event
        self.assayBufferGraphVLayout = QtWidgets.QVBoxLayout()
        self.assayBufferGraphVLayout.setContentsMargins(0, 10, 0, 0)
        self.assayBufferGraphVLayout.addWidget(self.assayBufferGraph)

        self.assayBufferGraphBoxGridVLayout = QtWidgets.QVBoxLayout()
        self.assayBufferGraphBoxGridVLayout.addLayout(self.assayBufferBoxGridLayout)
        self.assayBufferGraphBoxGridVLayout.addLayout(self.assayBufferGraphVLayout)
        #################################################################################################



        ######################## {QFormLayout for uBar} AND {uBar Graph} #######################
        self.uBarGraph = Graph(100,180)
        self.uBarGraph.setLabel(axis='left', text = 'uBar')
        self.uBarGraph.setLabel(axis='bottom', text = 'Time (s)')
        #self.uBarGraph.getViewBox().wheelEvent = self.on_wheel_event
        self.uBarGraphVLayout = QtWidgets.QVBoxLayout()
        self.uBarGraphVLayout.setContentsMargins(0, 10, 0, 0)
        self.uBarGraphVLayout.addWidget(self.uBarGraph)

        self.uBarGraphBoxGridVLayout = QtWidgets.QVBoxLayout()
        self.uBarGraphBoxGridVLayout.addLayout(self.uBarBoxGridLayout)
        self.uBarGraphBoxGridVLayout.addLayout(self.uBarGraphVLayout)
        ################################################################################################

        ######################## {QFormLayout for DuBar} AND {DuBar Graph} #######################
        self.DuBarGraph = Graph(100,180)
        self.DuBarGraph.setLabel(axis='left', text = 'D[uBar]')
        self.DuBarGraph.setLabel(axis='bottom', text = 'Time (s)')
        #self.DuBarGraph.getViewBox().wheelEvent = self.on_wheel_event
        self.DuBarGraphVLayout = QtWidgets.QVBoxLayout()
        self.DuBarGraphVLayout.setContentsMargins(0, 10, 0, 0)
        self.DuBarGraphVLayout.addWidget(self.DuBarGraph)

        self.DuBarGraphBoxGridVLayout = QtWidgets.QVBoxLayout()
        self.DuBarGraphBoxGridVLayout.addLayout(self.DuBarBoxGridLayout)
        self.DuBarGraphBoxGridVLayout.addLayout(self.DuBarGraphVLayout)
        ################################################################################################



        # {{QFormLayout for Assay Buffer} AND {Assay Buffer Graph}} AND {{Concentration Label} AND {Concentration Graph}} AND {{Concentration Label} AND {Concentration Graph}} #

        self.calculatedPlotsHLayout = QtWidgets.QHBoxLayout()
        self.calculatedPlotsHLayout.addLayout(self.assayBufferGraphBoxGridVLayout)
        self.calculatedPlotsHLayout.addLayout(self.uBarGraphBoxGridVLayout)
        self.calculatedPlotsHLayout.addLayout(self.DuBarGraphBoxGridVLayout)

        self.calculatedPlotsFrame.setLayout(self.calculatedPlotsHLayout)

    def calculationButtonsUI(self):

        """
            Initializes file menu, calculation button.
            :param {_ : }
            :return -> None
        
        """

        ############################## File Selection QDialog ##############################

        # Create a menu bar
        self.menu_bar = self.menuBar()

        # Create a 'File' menu
        self.file_menu = self.menu_bar.addMenu('File')

        # Add actions to select a file/folder
        self.select_folder_action = QAction('Load Acq Folder', self)
        self.select_ezview_action = QAction('Load EZView Data File', self)
        self.select_file_action = QAction('Load Cal File', self)
        self.select_save_calc_action = QAction('Save Calibration to File', self)

        self.select_folder_action.triggered.connect(self.select_folder)
        self.select_ezview_action.triggered.connect(self.select_ezview)
        self.select_file_action.triggered.connect(self.select_file)
        self.select_save_calc_action.triggered.connect(self.saveCalibrations)

        self.file_menu.addAction(self.select_folder_action)
        self.file_menu.addAction(self.select_file_action)
        self.file_menu.addAction(self.select_ezview_action)
        self.file_menu.addSeparator()
        self.file_menu.addAction(self.select_save_calc_action)

        ######################## O2 Zero and CO2 cal #############################

        # Initializing all the buttons
        self.o2CalibrateButton = Button("O2 Cal", 120, 26)
        self.o2ZeroButton = Button("O2 Zero", 120, 26)
        self.o2CalculateButton = Button("Calculate", 120, 26)

        self.co2ZeroButton = Button("CO2 Zero", 120, 26)
        self.co2SampleButton = Button("CO2 Sample", 120, 26)
        self.co2CalZeroButton = Button("CO2 Cal Zero", 120, 26)
        self.co2Cal1ulButton = Button("CO2 Cal 1µl", 120, 26)
        self.co2Cal2ulButton = Button("CO2 Cal 2µl", 120, 26)
        self.co2Cal3ulButton = Button("CO2 Cal 3µl", 120, 26)
        self.co2ZeroButton = Button("CO2 Zero", 120, 26)
        self.co2SampleButton = Button("CO2 Sample", 120, 26)

        # Initializing line edits
        self.o2TemperatureLabel = QtWidgets.QLabel("Temperature")
        self.o2TemperatureLineEdit = LineEdit()
        self.o2TemperatureLineEdit.setText("0")
        self.o2CalibrationLineEdit = LineEdit()
        self.o2ZeroLineEdit = LineEdit()
        self.o2AverageLineEdit = LineEdit()
        
        self.co2CalZeroLineEdit = LineEdit()
        self.co2Cal1ulLineEdit = LineEdit()
        self.co2Cal2ulLineEdit = LineEdit()
        self.co2Cal3ulLineEdit = LineEdit()

        self.co2ZeroLineEdit = LineEdit()
        self.co2SampleLineEdit = LineEdit()
        
        self.temperatureLineEdit = LineEdit()

        # Make line edits editable
        self.o2ZeroLineEdit.setReadOnly(False)
        self.o2TemperatureLineEdit.setReadOnly(False)
        self.o2CalibrationLineEdit.setReadOnly(False)
        self.o2AverageLineEdit.setReadOnly(False)
        
        self.co2CalZeroLineEdit.setReadOnly(False)
        self.co2Cal1ulLineEdit.setReadOnly(False)
        self.co2Cal2ulLineEdit.setReadOnly(False)
        self.co2Cal3ulLineEdit.setReadOnly(False)

        self.co2ZeroLineEdit.setReadOnly(False)
        self.co2SampleLineEdit.setReadOnly(False)

        
        

        self.lineEditList.extend([self.o2ZeroLineEdit, self.co2CalZeroLineEdit, self.co2Cal1ulLineEdit, self.co2Cal2ulLineEdit, self.co2Cal3ulLineEdit])

        # Initializing QLabels
        self.calibrationsBufferLabel = QtWidgets.QLabel("Calibrations")

        # Creating a QGrid Layout for co2 calibrations
        self.co2ZeroCo2CalGridLayout = QtWidgets.QGridLayout()
        # self.o2ZeroCo2CalGridLayout.addWidget(self.o2AssayBufferZeroLabel, 1, 1, 2, 2, alignment=QtCore.Qt.AlignCenter)
        # self.o2ZeroCo2CalGridLayout.addWidget(self.o2ZeroButton, 2, 1, alignment=QtCore.Qt.AlignCenter)
        # self.o2ZeroCo2CalGridLayout.addWidget(self.o2ZeroLineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        # self.o2ZeroCo2CalGridLayout.addWidget(self.assayBufferLabel, 3, 1, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2CalZeroButton, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2CalZeroLineEdit, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2Cal1ulButton, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2Cal1ulLineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2Cal2ulButton, 3, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2Cal2ulLineEdit, 3, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2Cal3ulButton, 4, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2Cal3ulLineEdit, 4, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2ZeroButton, 6, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2ZeroLineEdit, 6, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2SampleButton, 7, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2ZeroCo2CalGridLayout.addWidget(self.co2SampleLineEdit, 7, 2, alignment=QtCore.Qt.AlignCenter)
        # self.o2ZeroCo2CalGridLayout.addWidget(self.temperatureLabel, 8, 1, 1, 2, alignment=QtCore.Qt.AlignCenter)
        # self.o2ZeroCo2CalGridLayout.addWidget(self.temperatureLineEdit, 9, 1, 1, 2, alignment=QtCore.Qt.AlignCenter) # Main Layout 1
        self.co2ZeroCo2CalGridLayout.setRowStretch(1,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(2,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(3,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(4,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(5,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(6,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(7,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(8,1)
        self.co2ZeroCo2CalGridLayout.setRowStretch(9,1)
        self.co2ZeroCo2CalGridLayout.setColumnStretch(0,1)
        self.co2ZeroCo2CalGridLayout.setContentsMargins(2,5,125,0)
        
        # Creating a Qgrid Layout for o2
        self.o2GridLayout = QtWidgets.QGridLayout()
        self.o2GridLayout.addWidget(self.o2ZeroButton, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.addWidget(self.o2ZeroLineEdit, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.addWidget(self.o2CalibrateButton, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.addWidget(self.o2CalibrationLineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.addWidget(self.o2CalculateButton, 3, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.addWidget(self.o2AverageLineEdit, 3, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.addWidget(self.o2TemperatureLabel, 4, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.addWidget(self.o2TemperatureLineEdit, 4, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2GridLayout.setContentsMargins(125, 5, 125, 0)
        
        
        #################################################################################################

        #################################################################################################




        ########################{CO2 Zero Blank Extract} AND {CO2 O2 LineEdit Layout} ###################
        
        
        
        # unused leftover elements
        #Velocity and CO2 O2 Concentration Labels
        self.percentCO2Label = QtWidgets.QLabel("%CO2")
        self.uBar2Label = QtWidgets.QLabel("µBar CO2")

        #Velocity and CO2 O2 Concentration Text Edit
        self.percentCO2LineEdit = LineEdit()
        self.uBar2LineEdit = LineEdit()
        
        # O2 concentration
        self.uBarO2Label = QtWidgets.QLabel("µBar O2")
        self.uBarO2LineEdit = LineEdit()

        self.lineEditList.extend([self.percentCO2LineEdit, self.uBar2LineEdit])

        self.velocityConcentrationGridLayout = QtWidgets.QGridLayout()
        self.velocityConcentrationGridLayout.addWidget(self.percentCO2Label, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.uBar2Label, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.uBarO2Label, 1, 3, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.percentCO2LineEdit, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.uBar2LineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.uBarO2LineEdit, 2, 3, alignment=QtCore.Qt.AlignCenter)

        

        # Add to table and Purge Button
        self.addToTableButton = Button("Add to Table", 120, 26)
        self.purgeTableButton = Button("Purge Table", 120, 26)
        self.exportTableButton = Button("Export Table", 120, 26)
        self.copyTableRowButton = Button("Copy", 120, 26)
        self.stopButton = Button("STOP", 120, 26)

        self.addPurgeTableVLayout = QtWidgets.QVBoxLayout()
        self.addPurgeTableVLayout.addWidget(self.addToTableButton)
        self.addPurgeTableVLayout.addWidget(self.exportTableButton)
        self.addPurgeTableVLayout.addWidget(self.copyTableRowButton)
        self.addPurgeTableVLayout.addWidget(self.stopButton)
        self.addPurgeTableVLayout.addWidget(self.purgeTableButton)


        self.table = QtWidgets.QTableWidget()
        # Dummy row count
        #self.table.setRowCount(4)
        # set column count
        self.table.setColumnCount(3)
        self.table.setMaximumWidth(330)
        

        self.tableVLayout = QtWidgets.QVBoxLayout()
        self.tableVLayout.addWidget(self.table)
    
        
        # Table and addTable purgeTable layout
        self.tableVelocityConcentrationVLayout = QtWidgets.QVBoxLayout()
        self.tableVelocityConcentrationVLayout.addLayout(self.velocityConcentrationGridLayout)
        self.tableVelocityConcentrationVLayout.addLayout(self.tableVLayout)

        # Velocity Concentration Table layout
        self.tableVelocityConcentrationAddPurgeHLayout = QtWidgets.QHBoxLayout()
        self.tableVelocityConcentrationAddPurgeHLayout.addLayout(self.addPurgeTableVLayout)
        self.tableVelocityConcentrationAddPurgeHLayout.addLayout(self.tableVelocityConcentrationVLayout)        # Main Layout 4
        self.tableVelocityConcentrationAddPurgeHLayout.setContentsMargins(125,0,50,0)

        self.calculationButtonsFrameHLayout = QtWidgets.QHBoxLayout()
        self.calculationButtonsFrameHLayout.addLayout(self.co2ZeroCo2CalGridLayout)
        self.calculationButtonsFrameHLayout.addLayout(self.o2GridLayout)
        self.calculationButtonsFrameHLayout.addLayout(self.tableVelocityConcentrationAddPurgeHLayout)

        self.calculationButtonsFrame.setLayout(self.calculationButtonsFrameHLayout)
        #################################################################################################

    def initializeScrollArea(self):

        # Creating a scroll area and setting its properties.
        self.scrollArea = QtWidgets.QScrollArea()
        self.scrollArea.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.scrollArea.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOn)
        self.scrollArea.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOn)
        self.scrollArea.setWidgetResizable(True)

        # Creating a widget to set on the scroll area.
        self.scrollAreaWidget = QtWidgets.QWidget()
        self.scrollArea.setWidget(self.scrollAreaWidget)

        # Creating and setting a layout for scroll area widget.
        self.scrollAreaWidgetLayout = QtWidgets.QVBoxLayout(self.scrollAreaWidget)
        self.scrollAreaWidget.setLayout(self.scrollAreaWidgetLayout)

        # Setting the central widget with the scroll area.
        self.setCentralWidget(self.scrollArea)

    def initializeQFrames(self):

        # Creating a QFrame from User defined QFrame class.
        self.calculatedPlotsFrame = Frame(self.scrollArea, 0.8)
        self.calculationButtonsFrame = Frame(self.scrollArea, 0.7)
        # self.rawDataPlotFrame = Frame(self.scrollArea, 0.9)
        self.rawDataPlotFrame = RawPlotFrame(self.scrollArea, 0.9, self.application_state, 2, parent=self)
        # Adding QFrames to the scroll area widget layout.
        self.scrollAreaWidgetLayout.addWidget(self.calculatedPlotsFrame)
        self.scrollAreaWidgetLayout.addWidget(self.rawDataPlotFrame)
        self.scrollAreaWidgetLayout.addWidget(self.calculationButtonsFrame)

    def addCurveAndMeanBar(self):
        self.curve3 = Curve("uBar", [], pg.mkPen(color="#FFFFFF", width=4), self.uBarGraph)
        self.curve3.plotCurve()
        self.curve3.unhide()

        self.curve4 = Curve("D[uBar]", [], pg.mkPen(color="#FFFFFF", width=4), self.DuBarGraph)
        self.curve4.plotCurve()
        self.curve4.unhide()

    def connectUItoMethods(self):
        """
            Connects all the UI Components to their respective methods.
            :param {_ : }
            :return -> None

            We need to tell the program what to do when a UI component is interacted with (e.g. a button is clicked).
            So we connect the ui elements to methods that define the behavior of the element.

        """

        # QFileDialog Folder selection
        # self.barsButton.clicked.connect(self.barsButtonPressed)

        # self.plotAllButton.clicked.connect(self.plotAllButtonPressed)

        # Rescale button connect method.
        # self.rescaleButton.clicked.connect(self.rescaleButtonPressed)

        # Start button connect method.
        # self.startButton.clicked.connect(self.startButtonPressed)

        # Pause/Resume button connect method.
        # self.pauseResumeButton.clicked.connect(self.pauseResumeAction)

        # O2 Assay Buffer Zero Button connect method
        self.o2ZeroButton.clicked.connect(lambda: self.o2ZeroButtonPressed())

        # O2 Assay Buffer Zero LineEdit text edited connect method
        self.o2ZeroLineEdit.returnPressed.connect(lambda: self.OnEditedO2AssayCal())

        # Temperature Lineedir text edited connect method
        self.temperatureLineEdit.returnPressed.connect(lambda: self.OnEditedTemp())

        # CO2 Cal buttons connect method
        self.co2CalZeroButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2CalZeroLineEdit, 3, 0, 0))
        self.co2Cal1ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2Cal1ulLineEdit, 3, 0, 1))
        self.co2Cal2ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2Cal2ulLineEdit, 3, 0, 2))
        self.co2Cal3ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2Cal3ulLineEdit, 3, 0, 3))

        # CO2 Cal LineEdits connect text edited connet method
        self.co2CalZeroLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2CalZeroLineEdit, 3, 0, 0))
        self.co2Cal1ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2Cal1ulLineEdit, 3, 0, 1))
        self.co2Cal2ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2Cal2ulLineEdit, 3, 0, 2))
        self.co2Cal3ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2Cal3ulLineEdit, 3, 0, 3))

        # O2 cal buttons connect method
        self.o2TemperatureLineEdit.returnPressed.connect(self.temperatureTextChanged)
        self.o2ZeroLineEdit.returnPressed.connect(self.o2ZeroTextChanged)
        self.o2AverageLineEdit.returnPressed.connect(self.o2AverageTextChanged)

        self.o2ZeroButton.clicked.connect(self.o2ZeroButtonPressed)
        self.o2CalibrateButton.clicked.connect(self.o2CalButtonPressed)
        self.o2CalculateButton.clicked.connect(self.o2CalculateButtonPressed)

        #self.o2CalibrationLineEdit.returnPressed.connect(lambda: self.OnEditedO2Cal())

        # CO2 Zero button connect method
        self.co2ZeroButton.clicked.connect(self.co2ZeroButtonPressed)
        self.co2SampleButton.clicked.connect(self.co2SampleButtonPressed)

        # Add to Table connect method
        self.addToTableButton.clicked.connect(self.addToTableButtonPressed)

        # Stop Button connect method
        self.stopButton.clicked.connect(self.throwStopButtonWarning)

        # Purge Table connect method
        self.purgeTableButton.clicked.connect(self.purgeTableButtonPressed)

        # Export Table connect method
        self.exportTableButton.clicked.connect(self.tableFileSave)

    def select_ezview(self):
        # Open a file dialog to select a folder
        self.rawDataPlotFrame.EZViewPath, _ = QFileDialog.getOpenFileName(
            None,
            "Select a file",
            "",
            "All Files (*);;Text Files (*.txt)"
        )
        if self.rawDataPlotFrame.folder_path == "":
            return

        self.setWindowTitle(f"LabView {os.path.basename(self.rawDataPlotFrame.folder_path)}")
        self.application_state = "Folder_Selected"
        self.select_ezview_action.setEnabled(False)

    def select_folder(self):
        # Open a file dialog to select a folder
        self.rawDataPlotFrame.folder_path = QFileDialog.getExistingDirectory(self, 'Select a folder')
        if self.rawDataPlotFrame.folder_path == "":
            return

        self.rawDataPlotFrame.EZViewPath = None

        self.setWindowTitle(f"LabView {os.path.basename(self.rawDataPlotFrame.folder_path)}")
        self.dataObj.setDirectory(self.rawDataPlotFrame.folder_path)
        self.application_state = "Folder_Selected"
        self.select_folder_action.setEnabled(False)

################################################# End - User Interface Creation #################################################
#################################################################################################################################




#################################################################################################################################
##################################################### ButtonPressed Methods #####################################################

    def meanButtonPressed(self, lineEdit, curve):
        """
            When a mean button is pressed, sets the lineEdit with
            the current mean value from the mean bars on a certain curve.
            curve # 3 = mass 44
            curve # 0 = mass 32
            :param { lineEdit : QLineEdit} -> line edit that will display the mean value
            :param { curve : int} -> int that indicates the curve to take the mean from
            :return -> mean_value
        """

        # Get the left and right x points from the mean bars
        xleft, xright = self.rawDataPlotFrame.meanBar.getRegion()

        # if no data exists, return undefined
        if (not self.rawDataPlotFrame.sharedData.dataPoints.keys()):
            self.throwUndefined(lineEdit)
            return None

        # if one or both of the x values is not in the range of the dataset, return undefined
        elif (xright < list(self.rawDataPlotFrame.sharedData.dataPoints.keys())[0] or xleft > list(self.rawDataPlotFrame.sharedData.dataPoints.keys())[-1] or
                 xleft < list(self.rawDataPlotFrame.sharedData.dataPoints.keys())[0] or xright > list(self.rawDataPlotFrame.sharedData.dataPoints.keys())[-1]):
            
            self.throwUndefined(lineEdit)
            return None
        else:
            # get mean value between points
            
            # Find the closest x values in the data to the x values from the mean bars
            xleft = min(self.rawDataPlotFrame.sharedData.dataPoints.keys(), key=lambda x:abs(x-xleft))
            xright = min(self.rawDataPlotFrame.sharedData.dataPoints.keys(), key=lambda x:abs(x-xright))

            # Get mean from graph
            mean_value = Calculations.getMean(self.rawDataPlotFrame.sharedData.dataPoints, xleft, xright, curve)
        
            # Set line edit with mean value
            lineEdit.setText(str(mean_value))

            return mean_value

    def GraphMeanButtonPressed(self, lineEdit, curve, graph, concentration, manualEntry=False):
        """
            When a mean button is pressed, calls meanButtonPressed to get mean
            and then graphs concentration vs. mean on the proper graph and gets the slope
            of the line (calibration value).
            :param { lineEdit : QLineEdit} -> line edit that will display the mean value
            :param { curve : int} -> int that indicates the curve to take the mean from
            :param { graph : int} -> 0 if assay graph
            :param { concentration : int} -> concentration that will graph against mean
            :return -> None
        """

        # if mean value was entered manually, set mean_value to lineEdit text
        if manualEntry:
            if lineEdit.text() == '' or lineEdit.text() == 'undef':
                mean_value = None
            else:
                mean_value = float(lineEdit.text())
        else:
            # else, find the mean value
            mean_value = self.meanButtonPressed(lineEdit, curve)

        # graph mean value on the appropiate graph vs concentration
        self.graphConcentrationVsMean(mean_value, graph, concentration)

        # get the slope and intercept of the graph (calibration value)
        if (graph == 0):
            # find co2 buffer calibration (slope)
            self.co2BufferCalibration = Calculations.calculateSlope(self.assayBufferData)

            if self.co2BufferCalibration == None:
                #self.throwUndefined(self.biCarbCalLineEdit)
                self.throwUndefined(self.intercept1LineEdit)
            else:
                # set slope line edit
                #self.biCarbCalLineEdit.setText(str(round(self.co2BufferCalibration, 4)))
    
                # find intercept
                intercept = Calculations.calculateIntercept(self.assayBufferData, self.co2BufferCalibration)

                # set intercept line edit
                self.intercept1LineEdit.setText(str(round(intercept, 4)))
                self.co2Cal3ulLineEdit
        #if lineedit is co2 cal 3, then compute the co2/volt line        
        if (lineEdit == self.co2Cal3ulLineEdit):
            num = Calculations.calculateCo2OverVolt(float(self.co2CalZeroLineEdit.text()), 
                                                    float(self.co2Cal1ulLineEdit.text()), 
                                                    float(self.co2Cal2ulLineEdit.text()), 
                                                    float(self.co2Cal3ulLineEdit.text()))
            if(num == -99999): #num that is returned if num is undefinable
                self.throwUndefined(self.co2VoltLineEdit)
            else:
                self.co2VoltLineEdit.setText(str(round(num, 10)))

    def co2ZeroButtonPressed(self):
        """
        Sets the CO2Zero Mass 44 line edits with the mean value
        from the mean bars from the respective curve.
        :param {_ : }
        :return -> None
        """

        # Set mean value from mean bars for Mass 44 graph
        self.co2Zero44Reading = self.meanButtonPressed(self.co2ZeroLineEdit, 3)
        
    def co2SampleButtonPressed(self):
        """
        Sets the CO2 sample line edit to the mean value from the
        vertical mean bars in the raw plot.
        """
        try:
            self.co2SampleReading = self.meanButtonPressed(self.co2SampleLineEdit, 3)

            #assume zero button has been pressed
            co2Volt = float(self.co2VoltLineEdit.text())
            co2Sample = float(self.co2SampleLineEdit.text())
            co2Zero = float(self.co2ZeroLineEdit.text())
            #calculate values
            self.percentCO2 = Calculations.calculatePercentCO2(co2Volt, co2Sample, co2Zero)
            self.uBarCO2 = Calculations.calculateUbarCO2(self.percentCO2)
            #populate fields
            self.percentCO2LineEdit.setText(str(round(self.percentCO2, 4)))
            self.uBar2LineEdit.setText(str(round(self.uBarCO2, 4)))
        except:
            return

    def isFloat(self, string):
        """
        Checks if a string can be coverted to a float value
        :param {string : string}
        :return -> True or False
        """
        try:
            float(string)
            return True
        except ValueError:
            return False

    def o2ZeroButtonPressed(self):
        """
        Gets the mean of Mass 32 from the mean bars and sets the o2 zero value
        to the mean. Updates the o2 zero display accordingly.
        """
        # Set mean value from mean bars on the Mass 32 graph
        self.meanButtonPressed(self.o2ZeroLineEdit, 0)
        self.o2Zero = float(self.o2ZeroLineEdit.text())

    def o2ZeroTextChanged(self):
        """
        Set o2 zero value directly from the line edit.
        """
        
        try:
            # set to text value
            self.o2Zero = float(self.o2ZeroLineEdit.text())
        except:
            # set to default value
            self.o2ZeroLineEdit.setText("0")
            self.o2Zero = 0

    def temperatureTextChanged(self):
        """
        Reads the temperature value from the lineEdit and sets the temperature
        setting to that value.
        """
        
        try:
            # set temperature to text value
            self.o2Temperature = float(self.o2TemperatureLineEdit.text())
        except:
            # set temperature to default
            self.o2TemperatureLineEdit.setText("0")
            self.o2Temperature = 0
            
        #print(self.o2Temperature)

    def o2CalButtonPressed(self):
        """
        Calculates O2 calibration using temperature setting and O2 zero.
        """
        
        # calculate O2 air value given the temperature
        self.o2Air = Calculations.calculateO2Air(self.o2Temperature)
        
        # O2 calibration calculation
        self.o2Calibration = Calculations.calculateO2Cal(self.o2Air, self.o2Zero)
        self.o2CalibrationLineEdit.setText(str(round(self.o2Calibration, 4)))

    def o2CalculateButtonPressed(self):
        """
        Collects the avrage O2 mv from main plot, then calculates O2 concentrarion .
        """
        
        # obtain avrage of mass 32 to be used in the calculation
        self.meanButtonPressed(self.o2AverageLineEdit, 0)
        self.o2Measured = float(self.o2AverageLineEdit.text())
        
        # calculate uBar O2 concentration
        self.uBarO2 = Calculations.calculateUbarO2(self.o2Calibration, self.o2Measured)
        self.uBarO2LineEdit.setText(str(round(self.uBarO2, 4)))

    def o2AverageTextChanged(self):
        """
        After manual setting of mass 32 average, calculate O2 concentration.
        """
        
        try:
            # set to text value
            self.o2Measured = float(self.o2AverageLineEdit.text())
        except:
            # set to default value
            self.o2AverageLineEdit.setText("0")
            self.o2Measured = 0
            
        # calculate uBar O2 concentration
        self.uBarO2 = Calculations.calculateUbarO2(self.o2Calibration, self.o2Measured)
        self.uBarO2LineEdit.setText(str(round(self.uBarO2, 4)))

    def addToTableButtonPressed(self):
        """
        Executed when the Add To Table button is pressed.
        Adds the CO2/O2 velocity and concentration values to the table
        and graphs them on the velocity/concentration graph.
        :param {_ : }
        :return -> None
        """

        ####  Add values to the table  ####

        # create a new row
        newRowPosition = self.table.rowCount()
        self.table.insertRow(newRowPosition)

        # set values in row (%CO@, uBar CO2, uBar O2)
        self.table.setItem(newRowPosition, 0, QtWidgets.QTableWidgetItem(str(round(self.percentCO2, 4))))
        self.table.setItem(newRowPosition, 1, QtWidgets.QTableWidgetItem(str(round(self.uBarCO2, 4))))
        self.table.setItem(newRowPosition, 2, QtWidgets.QTableWidgetItem(str(round(self.uBarO2, 4))))

    def purgeTableButtonPressed(self):
        """
        Executed when Purge Table button is pressed.
        Saves table data to a csv file.
        Clears the table and velocity/concentration graph.
        :param {_ : }
        :return -> None
        """

        self.purgeTablepButtonWarning()

    def copyTableRowButtonPressed(self):
        """
        Copies selected table row to clipboard. Can only copy one row at a time
        :param {_ : }
        :return -> None
        """
        rowIndex = self.table.currentRow()

        # if a row is selected
        if rowIndex != -1:
            
            row = ''

            # create string with row values, separated by spaces
            for i in range(4):
                row += self.table.item(rowIndex, i).text() + ' '

            # copy row string to clipboard
            cb = QApplication.clipboard()
            cb.clear(mode=cb.Clipboard)
            cb.setText(row, mode=cb.Clipboard)


################################################## End - ButtonPressed Methods ##################################################
#################################################################################################################################


#################################################################################################################################
###################################################### On Edit Line Edits #######################################################

    def OnEditedTemp(self):
        
        # check for numerical input
        if (not self.isFloat(self.temperatureLineEdit.text()) and self.temperatureLineEdit.text() != ''):
            #throw execption
            self.throwFloatValueWarning()
            return
        
        if self.temperatureLineEdit.text() == '':
            self.temperature = 0
        else:
            self.temperature = float(self.temperatureLineEdit.text())

    def OnEditedO2AssayCal(self):
        """
        When the O2 Assay Buffer Zero line edit is edited, the O2ZeroButtonPressed method
        is called with manualEntry set as true.
        """

        # check for numerical input
        if (not self.isFloat(self.o2ZeroLineEdit.text()) and self.o2ZeroLineEdit.text() != ''):
            #throw execption
            self.throwFloatValueWarning()
            return

        # called method with manualEntry as True
        self.o2ZeroButtonPressed(True)

    def OnEditedCO2Cal(self, lineEdit, curve, graph, concentration):
        """
        When a CO2 cal line edit is edited, the GraphMeanButtonPressed method is called
        with manualEntry set as true.
        """

        if (not self.isFloat(lineEdit.text()) and lineEdit.text() != ''):
            #throw execption
            self.throwFloatValueWarning()
            lineEdit.setText('undef')
            
        self.GraphMeanButtonPressed(lineEdit, curve, graph, concentration, True)

    def OnEditedO2Cal(self):
        
        # check for numerical input
        if (not self.isFloat(self.o2CalibrationLineEdit.text()) and self.o2CalibrationLineEdit.text() != ''):
            #throw execption
            self.throwFloatValueWarning()
            return

        if self.o2CalibrationLineEdit.text() == '':
            self.o2Calibration = 0
        else:
            self.o2Calibration = float(self.o2CalibrationLineEdit.text())

#################################################### End - On Edit Line Edits ###################################################
#################################################################################################################################


#################################################################################################################################
####################################################### Raw Plot Methods ########################################################

    def update_main_plot_data(self, dataPoints):
       # Updates the real time plot after reading each row of data points from the file ONLY IF the pause bit is False.
       # :param {x_value : Float} -> x point value of the data point.
       # :param {y_value : Float} -> list of the y point values of the data point for different plots.
       # :return -> None
       y_value = [[], [], [], [], [], [], [], []]
       ubar_y_value = []
       dubar_y_value = []

       # Getting the next data points from the list of all the points emitted by the worker thread.
       while len(dataPoints) != 0:

           # Popping the first data points
           dataPoint = dataPoints.pop(0)

           # Getting the x coordinate and list of y coordinates from the tuple
           x, y = dataPoint

           # Updating the data points in the singleton class.
           for i in range(len(y_value)):
               y_value[i].append(y[i])

           # y - list of float - length 8

           # y_value - list of list - length 8[8]


           # Transform to reflect uBar

           temp_y = y.copy()
           co2Volt = 0
           co2Zero = 0

           if self.co2VoltLineEdit.text():
               co2Volt = float(self.co2VoltLineEdit.text())

           if self.co2ZeroLineEdit.text():
               co2Zero = float(self.co2ZeroLineEdit.text())


           percentCo2 = Calculations.calculatePercentCO2(co2Volt, y[3], co2Zero)
           uBarCO2 = Calculations.calculateUbarCO2(percentCo2)
           temp_y[3] = uBarCO2
           ubar_y_value.append(temp_y[3])


           dubar_y_value.append(self.lastUbar - temp_y[3])
           self.lastUbar = temp_y[3]

       # Updating all the curves
       self.checkMinMax(min(y), max(y), 0)
       self.checkMinMax(min(ubar_y_value), max(ubar_y_value), 1)
       self.checkMinMax(min(dubar_y_value), max(dubar_y_value), 2)

       self.curve3.updateDataPoints(x, ubar_y_value)
       self.followCurve(self.uBarGraph, ubar_y_value)
       self.curve4.updateDataPoints(x, dubar_y_value)
       self.followCurve(self.DuBarGraph, dubar_y_value)

    def followCurve(self, plot, y):
        try:
            if self.oldX == None:
                self.oldX = 0
        except:
            self.oldX = 0
        try:
            x = list(self.rawDataPlotFrame.sharedData.dataPoints.keys())[-1]

            # Get the current x-axis range
            current_range = plot.getXAxisRange()

            change = x - self.oldX
            plot.setXRange(current_range[0] + change, current_range[1] + change, padding=0)

            self.oldX = x

            if plot.getYAxisRange()[1] < y[-1]:
                plot.setNewYRange(y[-1] - plot.getYAxisRange()[1], y[-1])
            elif plot.getYAxisRange()[0] > y[-1]:
                plot.setNewYRange(y[-1], y[-1] - plot.getYAxisRange()[1])
        except Exception as e:
            print(e)

    def checkMinMax(self, min, max, graph):
        # graph 0 = real
        # graph 1 = ubar
        # graph 2 = dubar
        if self.yMinList[graph] == None and self.yMaxList[graph] == None:
            self.yMaxList[graph] = max
            self.yMinList[graph] = min
            self.isYChanged[graph] = True
            
        else:

            if min < self.yMinList[graph]:
                self.yMinList[graph] = min
                self.isYChanged[graph] = True

            if max > self.yMaxList[graph]:
                self.yMaxList[graph] = max
                self.isYChanged[graph] = True

    def on_wheel_event(self,event, axis=1):
        """
            For disabling the scroll on the axes.
        
        """
        event.ignore()

##################################################### End - Raw Plot Methods ####################################################
#################################################################################################################################


#################################################################################################################################
#################################################### File export and import #####################################################

    def saveCalibrations(self):
        """
        Opens a save file dialog and saves all calibration files to a csv file. Default location is . Default name
        is the date and time.
        """

        # datetime object containing current date and time
        now = datetime.now()

        # file name = dd/mm/YY H:M:S
        file_name = now.strftime("%d-%m-%y %H-%M-%S")

        # create path if it doesn't exist
        path = 'C:\\Users\\'+self.user+'\\Documents\\Calibrations'
        if not os.path.exists(path):
            os.makedirs(path)


        # Invoke Save File Dialog - returns the path of the file and file type
        path, ok = QtWidgets.QFileDialog.getSaveFileName(self, 'Save File', path+"\\"+file_name, "CSV Files (*.csv)")

        # if file type is not null
        if ok:

            # open file and write in calibrations
            with open(path, 'w') as csvfile:
                writer = csv.writer(csvfile, dialect='excel', lineterminator='\n')
                
                writer.writerow(['Temp', 'O2 Calibration', 'O2 Buffer Zero', 'BiCarb/CO2',
                                 'CO2 Cal 0', 'CO2 Cal 6', 'CO2 Cal 12', 'CO2 Cal 18',
                                 'BiCarb Cal 0', 'BiCarb Cal 2', 'BiCarb Cal 4', 'BiCarb Cal 6'])

                row = (lineEdit.text() for lineEdit in  self.calibrationLineEdits)
                writer.writerow(row)

    def loadCals(self, file_path):

        """
        Loads calibration values from a csv file.
        """

        with open(file_path[0], newline='') as cal_file:
            reader = csv.reader(cal_file)
            next(reader) # read in header
            data = next(reader) # read in cal data


            for i in range(len(self.calibrationLineEdits)):
                self.calibrationLineEdits[i].setText(data[i])

            # Update values
            self.OnEditedTemp()  # temperature

            self.OnEditedO2Cal()  # O2 Assay Buffer Zero

            # CO2 Assay Buffer Cals
            try:
                self.OnEditedCO2Cal(self.calibrationLineEdits[4], 3, 0, 0)
                self.OnEditedCO2Cal(self.calibrationLineEdits[5], 3, 0, 1000)
                self.OnEditedCO2Cal(self.calibrationLineEdits[6], 3, 0, 2000)
                self.OnEditedCO2Cal(self.calibrationLineEdits[7], 3, 0, 3000)
            except:
                pass
            # CO2 HCl Cals
            try:
                self.OnEditedCO2Cal(self.calibrationLineEdits[8], 3, 1, 0)
                self.OnEditedCO2Cal(self.calibrationLineEdits[9], 3, 1, 33.3)
                self.OnEditedCO2Cal(self.calibrationLineEdits[10], 3, 1, 66.6)
                self.OnEditedCO2Cal(self.calibrationLineEdits[11], 3, 1, 99.9)
            except:
                pass

    def tableFileSave(self):
        """
        Creates a Save File Dialog for user to decide what to name file and where to save it.
        Saves all the data currently in the table to a file (.csv by default)
        """

        # create directory if it doesn't already exist
        path = 'C:\\Users\\'+self.user+'\\Documents\\TableData'
        if not os.path.exists(path):
            os.makedirs(path)

        # Invoke Save File Dialog - returns the path of the file and file type
        path, ok = QtWidgets.QFileDialog.getSaveFileName(self, 'Save File', path, "CSV Files (*.csv)")

        # if file type is not null
        if ok:
            columns = range(self.table.columnCount()) # get column count

            # open file and write in table contents
            with open(path, 'w') as csvfile:
                writer = csv.writer(csvfile, dialect='excel', lineterminator='\n')

                # write each row into the file
                for row in range(self.table.rowCount()):
                    writer.writerow(self.table.item(row, column).text() for column in columns)

    def exportRawData(self):
        """
        Exports all the data from the raw data plot to a csv file.
        """

        # create directory if it doesn't already exist
        path = 'C:\\Users\\'+self.user+'\\Documents\\RawData'
        if not os.path.exists(path):
            os.makedirs(path)

        # open file for writing, will create file if it doesn't already exist
        file = open(path + os.path.basename(self.rawDataPlotFrame.folder_path) + "Data.csv", 'w+')

        writer = csv.writer(file)   # create csv writer

        # write header to csv file
        writer.writerow(['Count', 'Time', 'm32', 'm34', 'm36', 'm44', 'm45', 'm46', 'm47', 'm49'])

        # get list of time and voltage values from data
        times = list(self.rawDataPlotFrame.sharedData.dataPoints.keys())
        voltages = list(self.rawDataPlotFrame.sharedData.dataPoints.values())

        # write lines of data to csv file
        for i in range(len(self.rawDataPlotFrame.sharedData.dataPoints)):
            row = [i, times[i]*1000, voltages[i][0], voltages[i][1], voltages[i][2], voltages[i][3],
                               voltages[i][4], voltages[i][5], voltages[i][6], voltages[i][7]]

            writer.writerow(row)

        # close file
        file.close()

################################################## End - File epxort and import #################################################
#################################################################################################################################


#################################################################################################################################
############################################# Warning Dialog and Exception Methods ##############################################

    # Stop button warning

    def throwStopButtonWarning(self):
        stopWarningDlg = Dialog(title="WARNING!!", buttonCount=2, message="Are you sure you want to STOP?.\nPress Cancel to abort or OK to continue", parent=self)
        stopWarningDlg.buttonBox.accepted.connect(lambda: self.stopDiaAccepted(stopWarningDlg))
        stopWarningDlg.buttonBox.rejected.connect(lambda: self.stopDiaRejected(stopWarningDlg))
        stopWarningDlg.exec()

    def stopDiaAccepted(self, obj):
        obj.close()

        saveCalsDlg = Dialog(title="Save Calibrations?", buttonCount=3, message="Would you like to keep calibrations in the program?\n Press Save to export calibrations", parent=self)
        saveCalsDlg.buttonBox.addButton("Save", QDialogButtonBox.HelpRole)
        saveCalsDlg.buttonBox.helpRequested.connect(lambda: self.saveCals(saveCalsDlg))
        saveCalsDlg.buttonBox.accepted.connect(lambda: self.keepCalsAccepted(saveCalsDlg))
        saveCalsDlg.buttonBox.rejected.connect(lambda: self.keepCalsRejected(saveCalsDlg))
        saveCalsDlg.exec()

        if self.application_state == "Out_Of_Data" or self.application_state == "Folder_Selected" or self.application_state == "Idle":
            pass
        else:
            try:
                self.rawDataPlotFrame.clear()
            except RuntimeError as exception:
                print(exception)

        #export all raw data if there is data to load
        if self.rawDataPlotFrame.folder_path != '':
            self.exportRawData()

        self.clearApplication(self.keepCals)

    def stopDiaRejected(self, obj):
        obj.close()

    def saveCals(self, obj):
        obj.close()
        self.saveCalibrations()
        
    def keepCalsAccepted(self, obj):
        self.keepCals = True
        obj.close()

    def keepCalsRejected(self, obj):
        self.keepCals = False
        obj.close()

    def throwGraphInActiveException(self):
        startButtonExceptionDlg = Dialog(title="EXCEPTION!!", buttonCount=1, message="The plot is inactive. Please make sure the graph is actively plotting.\nPress Ok to continue.", parent=self)
        startButtonExceptionDlg.buttonBox.accepted.connect(lambda: self.buttonDialogAccepted(startButtonExceptionDlg))
        startButtonExceptionDlg.exec()

    def buttonDialogAccepted(self, obj):
        obj.close()

    def startButtonDialogAccepted(self, dlg):
        dlg.close()

    def throwFloatValueWarning(self):
        floatWarningDlg = Dialog(title="WARNING!", buttonCount=1, message="The entered value is not a numerical value!", parent=self)
        floatWarningDlg.buttonBox.accepted.connect(lambda: self.floatWarningAccepted(floatWarningDlg))
        floatWarningDlg.exec()

    def floatWarningAccepted(self, obj):
        obj.close()

    def purgeTablepButtonWarning(self):

        """
        Throws the purge table warning.
        :param -> None.
        :return -> None
        """

        purgeWarningDlg = Dialog(title="WARNING!!", buttonCount=2, message="Are you sure you want to Purge Table? The unsaved data will be deleted.\nPress Cancel to abort or OK to continue", parent=self)
        purgeWarningDlg.buttonBox.accepted.connect(lambda: self.purgeDiaAccepted(purgeWarningDlg))
        purgeWarningDlg.buttonBox.rejected.connect(lambda: self.purgeDiaRejected(purgeWarningDlg))
        purgeWarningDlg.exec()

    def purgeDiaAccepted(self, obj):
        
        """
        Closes the purge warning dialoge. Purges the table and clears O2 and Co2 velocity concentration data.
        Also clears concentration graphs.
        :param {obj: Dialog} -> Purge warning dialog object.
        :return -> None
        """

        obj.close()
        # clear table
        self.table.setRowCount(0)

        # clear data sets
        self.o2VelocityConcentrationData.clear()
        self.co2VelocityConcentrationData.clear()

        # clear plots
        self.DuBarGraph.clear()

        #autoscale other graphs
        self.assayBufferGraph.plotItem.getViewBox().autoRange()
        self.uBarGraph.plotItem.getViewBox().autoRange()
    
    def purgeDiaRejected(self, obj):
        """
        Closes the purge warning dialoge.
        :param {obj: Dialog} -> Purge warning dialog object.
        :return -> None
        """
        obj.close()
        pass

    def throwUndefined(self, lineEdit):
        lineEdit.setText('undef')

################################################## End - Warning Dialog and ExceptionMethods #####################################
##################################################################################################################################

    def select_file(self):
        # Open a file dialog to select a file
        file_path = QFileDialog.getOpenFileName(self, 'Select a file', os.getcwd(), "CSV Files (*.csv)")

        # if file is selected
        if file_path[0] != '':
            # load calibration file
            self.loadCals(file_path)

    def graphConcentrationVsMean(self, mean, graph, concentration):
        """
        Creates a Save File Dialog for user to decide what to name file and where to save it.
        Saves all the data currently in the table to a file (.csv by default)
        """
        
        if (graph == 0):

            # if point already exists, delete point
            for key in dict(self.assayBufferData).keys():
                if key == concentration:
                    del self.assayBufferData[key]

            # if mean value is not undefined, create new point
            if (mean != None):    
                self.assayBufferData[concentration] = mean

            # clear graph before replot
            self.assayBufferGraph.clear()

            # plot all points on the assay buffer graph
            assayLine = self.assayBufferGraph.plot(list(self.assayBufferData.values()), list(self.assayBufferData.keys()), pen=None, symbol='o',
                                       symbolsize=1, symbolPen=pg.mkPen(color="#00fa9a", width=0), symbolBrush=pg.mkBrush("#00fa9a"))
            
            self.assayBufferGraph.plotItem.getViewBox().autoRange()

        else:
            # if point already exists, delete point
            for key in dict(self.hclData).keys():
                if key == concentration:
                    del self.hclData[key]

            # if mean value is not undefined, create new point
            # if (mean != None):
            #     self.hclData[concentration] = mean
            # self.uBarGraph.clear()
            # # plot point on the hcl graph
            # hclLine = self.uBarGraph.plot(list(self.hclData.values()), list(self.hclData.keys()), pen=None, symbol='o',
            #                            symbolsize=1, symbolPen=pg.mkPen(color="#00fa9a", width=0), symbolBrush=pg.mkBrush("#00fa9a"))
            #
            # self.uBarGraph.plotItem.getViewBox().autoRange()

    def clearApplication(self, keepCals):
        """
            When the STOP button is pressed, the application resets. This methods reinitializes the initial
            parameters of the application and clears any saved data unless calibrations are asked to be retained by the user.
            Post this function execution, the application is ready to plot new data.
            :param { keepCals : list(QLineEdit)} -> List of calibration line edit that needs to be retained.
            :return -> None
        """

        # Reset all application global variables. These varibales are global to different components of the application.
        self.setWindowTitle("LabView")
        self.application_state = "Idle"
        self.firstPoint = False
        
        self.yRealMax = None
        self.yRealMin = None
        self.isRealYChanged = False

        self.yUbarMax = None
        self.yUbarMin = None
        self.isUbarYChanged = False

        self.yDubarMax = None
        self.yDubarMin = None
        self.isDubarYChanged = False
        
        self.select_folder_action.setEnabled(True)
        self.select_ezview_action.setEnabled(True)


        # Dictionaries to hold data for graphs
        if not keepCals:
            self.assayBufferData = {}
            self.hclData = {}
        self.o2VelocityConcentrationData = {}
        self.co2VelocityConcentrationData = {}

        # Initialize O2 and CO2 Calibrations
        self.o2Calibration = 0
        self.co2BufferCalibration = 0
        self.co2HCLCalibration = 0
        self.biCarbCo2Ratio = 0

        # Initialize CO2 and O2 Blank values
        self.co2Blank = 0
        self.o2Blank = 0

        # Initialize CO2 and O2 Extract values
        self.co2Extract = 0
        self.o2Extract = 0

        #Initialize CO2 and O2 net rate of consumption
        self.co2ConsumptionRate = 0
        self.o2ConsumptionRate = 0

        # Initialize CO2 and O2 rate of consumption and concentrations
        self.percentCO2 = 0
        self.uBarCO2 = 0
        # self.co2Concentration = 0
        # self.o2Concentration = 0

        self.co2Zero44Reading = 0

        # Data Object for getting the points.
        self.dataObj = GetData()
        
        for lineEdit in self.lineEditList:
            if not keepCals:
                lineEdit.setText("")

        self.curve3.clear()
        self.curve4.clear()

        # Uncheck all the graph boxes.
        self.rawDataPlotFrame.clear()