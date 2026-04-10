
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
from PyQt5.QtWidgets import QApplication, QFileDialog, QAction
from PyQt5.QtWidgets import QDialogButtonBox
from PyQt5.QtWidgets import QSizePolicy

import pyqtgraph as pg
import sys, os, csv, json
import logging

logger = logging.getLogger(__name__)

from sympy import sympify
from PyQt5.QtCore import Qt
import numpy as np
from datetime import datetime


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
from Code.Module_Main_1_3.Application.uiElements.graph import Graph
from Code.Module_Main_1_3.Application.uiElements.frame import Frame
from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations
from Code.Module_Main_1_3.Application.uiElements.button import Button
from Code.Module_Main_1_3.Application.uiElements.dialog import Dialog
from Code.Module_Main_1_3.Application.uiElements.LineEdit import LineEdit
from Code.Module_Main_1_3.Application.CustomWidgets.rawPlotFrame import RawPlotFrame
from Code.Module_Main_1_3.Application.CustomWidgets.customCalculatoinPlot import customCalculationPlot



class LabViewModule1(QtWidgets.QMainWindow):

    def __init__(self, width, height, app):
        """
        This method initializes the LabView class.
        This is where we initialize values and call the methods that create the User Interface
        """
        super(LabViewModule1, self).__init__()

        self.delayTimer = None

        self.app = app
        self.screen_width = width
        self.screen_height = height

        self.setGeometry(0, 0, width, height)
        self.setMinimumSize(int(width//2), int(width//2))

        # get current user's username
        self.user = os.getlogin()
        logger.info(f"Application initializing for user: {self.user}")

        # Set of all keys down
        self.keys_down = set()

        # Setting varibales that will be used for the logic
        self.setWindowTitle("LabView")
        self.sharedData = SharedSingleton()
        self.sharedData.fileList = []
        self.sharedData.dataPoints = {}
        self.sharedData.folderAccessed = False
        self.sharedData.xPoint = 0
        self.sharedData.initialX = None
        self.delay = 200
        self.firstPoint = False
        self.fileCheckThreadStarted = False
        self.autosave_timer = QtCore.QTimer()
        self.autosave_timer.setSingleShot(True)
        self.autosave_timer.setInterval(2000)  # 2 seconds debounce
        self.autosave_timer.timeout.connect(self.autosaveData)
        logger.debug(f"Autosave timer initialized (Interval: {self.autosave_timer.interval()}ms)")

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
        self.vC = 0
        self.vO = 0
        self.co2Concentration = 0
        self.o2Concentration = 0

        self.co2Zero44Reading = 0
        self.co2Zero45Reading = 0

        self.keepCals = False

        # Custom Plot axises
        self.DefaultXAxisEquiation = "ln(Mass44 - CO2Zero44)"
        self.DefaultYAxisEquiation = "ln(Mass45 - CO2Zero45)"

        self.xAxisEquiation = sympify(self.DefaultXAxisEquiation)
        self.yAxisEquiation = sympify(self.DefaultYAxisEquiation)
        self.sampleEquationXPlotData = []
        self.sampleEquationYPlotData = []

        # store calculated values for current sample plot
        self.currentPlotData = (dict)
        # List for holding custom plot data

        # Data Object for getting the points.
        self.dataObj = GetData()

        # Initialize scroll area
        self.initializeScrollArea()

        # Initialzie the QFrames
        self.initializeQFrames()

        # List of calibration line edits
        self.calibrationLineEdits = [self.temperatureLineEdit, self.o2CalibrationLineEdit, self.o2ZeroLineEdit, self.biCarbCo2LineEdit,
                                    self.co2CalZeroLineEdit, self.co2Cal6ulLineEdit, self.co2Cal12ulLineEdit, self.co2Cal18ulLineEdit,
                                    self.biCarbCalZeroLineEdit, self.biCarbCal2ulLineEdit, self.biCarbCal4ulLineEdit,
                                    self.biCarbCal6ulLineEdit]

        # Connect UI to Methods
        self.connectUItoMethods()

        # Connect autosave for line edits
        for le in self.lineEditList:
            le.textChanged.connect(self.triggerAutosave)

        # Connect autosave for table
        self.table.itemChanged.connect(self.triggerAutosave)

        # Connect autosave for custom calculation plot table
        if hasattr(self, 'customCalculationPlots') and self.customCalculationPlots:
            self.customCalculationPlots.calculationPlotTable.itemChanged.connect(self.triggerAutosave)

        # Check for improper shutdown on launch
        self.checkForImproperShutdown()

        self.show()

    def checkForImproperShutdown(self):
        """
        Checks if the last autosave was not properly closed and prompts the user to load it.
        """
        path = 'C:\\Users\\' + self.user + '\\Documents\\ApplicationData'
        autosave_path = os.path.join(path, 'autosave.json')
        if os.path.exists(autosave_path):
            try:
                with open(autosave_path, 'r') as f:
                    data = json.load(f)
                if not data.get("properly_closed", False):
                    # Improper shutdown detected
                    reply = QtWidgets.QMessageBox.question(self, 'Improper Shutdown Detected',
                                                           'The application was not closed properly. Would you like to load the last autosave?',
                                                           QtWidgets.QMessageBox.Yes | QtWidgets.QMessageBox.No, QtWidgets.QMessageBox.Yes)
                    if reply == QtWidgets.QMessageBox.Yes:
                        self.loadAllData(file_path=autosave_path)
            except Exception as e:
                logger.error(f"Error checking for improper shutdown: {e}")

    def closeEvent(self, event):
        """
        Handles the application close event.
        """
        self.autosaveData(properly_closed=True)
        event.accept()

#################################################################################################################################
################################################# User Interface Creation #################################################
    """
    The user interface is broken up into three frames:
    - one frame for the raw data plot (rawDataPlotUI)
    - one for the the top tabbed section
        - whichs first tab is calculated plots(calculatedPlotsUI)
        - Second tab: TODO
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

    def rawDataPlotUI(self):
        pass

    def calculatedPlotsUI(self):

        ###################################### QFormLayout for Assay Buffer #####################################

        # Widgets to be added in the layout
        self.calculatedPlotsFrame = Frame(self.scrollArea, 0.7)

        self.intercept1Label = QtWidgets.QLabel("Intercept")
        self.biCarbCalLabel = QtWidgets.QLabel("BiCarb cal (nmol/ml/mV)")
        self.assayBufferLabel = QtWidgets.QLabel("Assay Buffer")
        self.emptyLabel = QtWidgets.QLabel("")

        self.intercept1LineEdit = LineEdit()
        self.biCarbCalLineEdit = LineEdit()
        
        self.lineEditList.extend([self.intercept1LineEdit, self.biCarbCalLineEdit])

        self.assayBufferBoxGridLayout = QtWidgets.QGridLayout()
        self.assayBufferBoxGridLayout.addWidget(self.emptyLabel, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.intercept1Label, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.biCarbCalLabel, 1, 3, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.assayBufferLabel, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.intercept1LineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.addWidget(self.biCarbCalLineEdit, 2, 3, alignment=QtCore.Qt.AlignCenter)
        self.assayBufferBoxGridLayout.setHorizontalSpacing(10)
        ###############################################################################################

        ###################################### QFormLayout for HCL #####################################

        # Widgets to be added in the layout
        self.intercept2Label = QtWidgets.QLabel("Intercept 2")
        self.nmolLabel = QtWidgets.QLabel("(nmol/ml/mV)")
        self.hclLabel = QtWidgets.QLabel("HCL")

        self.intercept2LineEdit = LineEdit()
        self.nmolLineEdit = LineEdit()

        self.lineEditList.extend([self.intercept2LineEdit, self.nmolLineEdit])

        self.hclBoxGridLayout = QtWidgets.QGridLayout()
        self.hclBoxGridLayout.addWidget(self.emptyLabel, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.hclBoxGridLayout.addWidget(self.intercept2Label, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.hclBoxGridLayout.addWidget(self.nmolLabel, 1, 3, alignment=QtCore.Qt.AlignCenter)
        self.hclBoxGridLayout.addWidget(self.hclLabel, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.hclBoxGridLayout.addWidget(self.intercept2LineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.hclBoxGridLayout.addWidget(self.nmolLineEdit, 2, 3, alignment=QtCore.Qt.AlignCenter)
        ###############################################################################################



        ######################## {QFormLayout for Assay Buffer} AND {Assay Buffer Graph} #######################

        self.assayBufferGraph = Graph(100,180)
        self.assayBufferGraph.setLabel(axis='left', text = 'CO2 (nmol/ml)')
        self.assayBufferGraph.setLabel(axis='bottom', text = 'Voltage (mV)')
        self.assayBufferGraphVLayout = QtWidgets.QVBoxLayout()
        self.assayBufferGraphVLayout.setContentsMargins(0, 10, 0, 0)
        self.assayBufferGraphVLayout.addWidget(self.assayBufferGraph)

        self.assayBufferGraphBoxGridVLayout = QtWidgets.QVBoxLayout()
        self.assayBufferGraphBoxGridVLayout.addLayout(self.assayBufferBoxGridLayout)
        self.assayBufferGraphBoxGridVLayout.addLayout(self.assayBufferGraphVLayout)
        #################################################################################################

        ######################## {QFormLayout for HCL} AND {HCL Graph} #######################

        self.hclGraph = Graph(100,180)
        self.hclGraph.setLabel(axis='left', text = 'BiCarb (nmol/ml)')
        self.hclGraph.setLabel(axis='bottom', text = 'Voltage (mV)')
        self.hclGraphVLayout = QtWidgets.QVBoxLayout()
        self.hclGraphVLayout.setContentsMargins(0, 10, 0, 0)
        self.hclGraphVLayout.addWidget(self.hclGraph)

        self.hclGraphBoxGridVLayout = QtWidgets.QVBoxLayout()
        self.hclGraphBoxGridVLayout.addLayout(self.hclBoxGridLayout)
        self.hclGraphBoxGridVLayout.addLayout(self.hclGraphVLayout)
        ################################################################################################



        ######################## {Concentration Label} AND {Concentration Graph} #######################

        self.concentrationGraph = Graph(100,180)
        self.concentrationGraph.setLabel(axis='left', text = 'Velocity')
        self.concentrationGraph.setLabel(axis='bottom', text = '[CO2] (nmol/ml/sec)')

        self.concentrationGraph2 = Graph(100, 180)
        self.concentrationGraph2.setLabel(axis='bottom', text='[CO2] (nmol/ml/sec)')

        self.concentrationGraphVLayout = QtWidgets.QSplitter(QtCore.Qt.Horizontal)
        self.concentrationGraphVLayout.setContentsMargins(0, 10, 0, 0)
        self.concentrationGraphVLayout.addWidget(self.concentrationGraph)
        self.concentrationGraphVLayout.addWidget(self.concentrationGraph2)

        self.concentrationLabelGraphVLayout = QtWidgets.QVBoxLayout()
        self.concentrationGraphLabel = QtWidgets.QLabel("Velocity - Concentration Graph")
        self.concentrationGraphLabel.setContentsMargins(0,10,0,0)
        self.concentrationLabelGraphVLayout.addWidget(self.concentrationGraphLabel, alignment=QtCore.Qt.AlignCenter)
        self.concentrationLabelGraphVLayout.addWidget(self.concentrationGraphVLayout)
        #################################################################################################


        # {{QFormLayout for Assay Buffer} AND {Assay Buffer Graph}} AND {{Concentration Label} AND {Concentration Graph}} AND {{Concentration Label} AND {Concentration Graph}} #

        self.calculatedPlotsHLayout = QtWidgets.QHBoxLayout()
        self.calculatedPlotsHLayout.addLayout(self.assayBufferGraphBoxGridVLayout)
        self.calculatedPlotsHLayout.addLayout(self.hclGraphBoxGridVLayout)
        self.calculatedPlotsHLayout.addLayout(self.concentrationLabelGraphVLayout)

        self.calculatedPlotsFrame.setLayout(self.calculatedPlotsHLayout)

    def calculationButtonsUI(self):
        """
            Initializes file menu, calculation button.
            :param {_ : }
            :return -> None
        
        """
        self.calculationButtonsFrame = Frame(self.scrollArea, 0.7)

        ############################## File Selection QDialog ##############################

        # Create a menu bar
        self.menu_bar = self.menuBar()

        # Create a 'File' menu
        self.file_menu = self.menu_bar.addMenu('File')

        # Add actions to select a file/folder
        self.select_folder_action = QAction('Load Acq Folder', self)
        self.select_ezview_action = QAction('Load EZView Data File', self)
        self.select_file_action = QAction('Load Calibration File', self)
        self.select_save_calc_action = QAction('Save Calibration to File', self)
        self.save_all_action = QAction('Save All Data', self)
        self.load_all_action = QAction('Load All Data', self)

        self.select_folder_action.triggered.connect(self.select_folder)
        self.select_ezview_action.triggered.connect(self.select_ezview)
        self.select_file_action.triggered.connect(self.select_file)
        self.select_save_calc_action.triggered.connect(self.saveCalibrations)
        self.save_all_action.triggered.connect(self.saveAllData)
        self.load_all_action.triggered.connect(self.loadAllData)

        self.file_menu.addAction(self.select_folder_action)
        self.file_menu.addAction(self.select_file_action)
        self.file_menu.addAction(self.select_ezview_action)
        self.file_menu.addSeparator()
        self.file_menu.addAction(self.select_save_calc_action)
        self.file_menu.addSeparator()
        self.file_menu.addAction(self.save_all_action)
        self.file_menu.addAction(self.load_all_action)

        ######################## O2 Zero and CO2 cal #############################

        # Initializing all the buttons
        self.o2ZeroButton = Button("O2 Zero", 120, 26)
        self.co2CalZeroButton = Button("CO2 Cal Zero", 120, 26)
        self.co2Cal6ulButton = Button("CO2 Cal 6ul", 120, 26)
        self.co2Cal12ulButton = Button("CO2 Cal 12ul", 120, 26)
        self.co2Cal18ulButton = Button("CO2 Cal 18ul", 120, 26)

        # Initializing line edits
        self.o2ZeroLineEdit = LineEdit()
        self.o2ZeroLineEdit.setReadOnly(False)
        self.co2CalZeroLineEdit = LineEdit()
        self.co2Cal6ulLineEdit = LineEdit()
        self.co2Cal12ulLineEdit = LineEdit()
        self.co2Cal18ulLineEdit = LineEdit()
        self.temperatureLineEdit = LineEdit()

        # Make line edits editable
        self.co2CalZeroLineEdit.setReadOnly(False)
        self.co2Cal6ulLineEdit.setReadOnly(False)
        self.co2Cal12ulLineEdit.setReadOnly(False)
        self.co2Cal18ulLineEdit.setReadOnly(False)
        
        # make temperature LineEdit editable
        self.temperatureLineEdit.setReadOnly(False)

        self.lineEditList.extend([self.o2ZeroLineEdit, self.co2CalZeroLineEdit, self.co2Cal6ulLineEdit, self.co2Cal12ulLineEdit, self.co2Cal18ulLineEdit, self.temperatureLineEdit])

        # Initializing QLabels
        self.o2AssayBufferZeroLabel = QtWidgets.QLabel("O2 Assay Buffer Zero")
        self.temperatureLabel = QtWidgets.QLabel("Temperature (C)")
        self.assayBufferLabel = QtWidgets.QLabel("Assay Buffer")

        # Creating a QGrid Layout
        self.o2ZeroCo2CalGridLayout = QtWidgets.QGridLayout()
        self.o2ZeroCo2CalGridLayout.addWidget(self.o2AssayBufferZeroLabel, 1, 1, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.o2ZeroButton, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.o2ZeroLineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.assayBufferLabel, 3, 1, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2CalZeroButton, 4, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2CalZeroLineEdit, 4, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2Cal6ulButton, 5, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2Cal6ulLineEdit, 5, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2Cal12ulButton, 6, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2Cal12ulLineEdit, 6, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2Cal18ulButton, 7, 1, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.co2Cal18ulLineEdit, 7, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.temperatureLabel, 8, 1, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.o2ZeroCo2CalGridLayout.addWidget(self.temperatureLineEdit, 9, 1, 1, 2, alignment=QtCore.Qt.AlignCenter) # Main Layout 1
        self.o2ZeroCo2CalGridLayout.setRowStretch(1,1)
        self.o2ZeroCo2CalGridLayout.setRowStretch(2,2)
        self.o2ZeroCo2CalGridLayout.setRowStretch(3,1)
        self.o2ZeroCo2CalGridLayout.setRowStretch(4,1)
        self.o2ZeroCo2CalGridLayout.setRowStretch(5,1)
        self.o2ZeroCo2CalGridLayout.setRowStretch(6,1)
        self.o2ZeroCo2CalGridLayout.setRowStretch(7,1)
        self.o2ZeroCo2CalGridLayout.setRowStretch(8,1)
        self.o2ZeroCo2CalGridLayout.setRowStretch(9,1)
        #################################################################################################



        ######################## BiCarb/CO2 and BiCarb cal #############################

        # Initializing all the buttons
        self.biCarbCo2Button = Button("BiCarb/CO2", 120, 26)
        self.biCarbCalZeroButton = Button("BiCarb Cal Zero", 120, 26)
        self.biCarbCal2ulButton = Button("BiCarb Cal 2ul", 120, 26)
        self.biCarbCal4ulButton = Button("BiCarb Cal 4ul", 120, 26)
        self.biCarbCal6ulButton = Button("BiCarb Cal 6ul", 120, 26)

        # Initializing line edits
        self.biCarbCo2LineEdit = LineEdit()
        self.biCarbCalZeroLineEdit = LineEdit()
        self.biCarbCal2ulLineEdit = LineEdit()
        self.biCarbCal4ulLineEdit = LineEdit()
        self.biCarbCal6ulLineEdit = LineEdit()
        self.o2CalibrationLineEdit = LineEdit()

        # Make line edits editable
        self.biCarbCo2LineEdit.setReadOnly(False)
        self.biCarbCalZeroLineEdit.setReadOnly(False)
        self.biCarbCal2ulLineEdit.setReadOnly(False)
        self.biCarbCal4ulLineEdit.setReadOnly(False)
        self.biCarbCal6ulLineEdit.setReadOnly(False)
        self.o2CalibrationLineEdit.setReadOnly(False)

        self.lineEditList.extend([self.biCarbCo2LineEdit, self.biCarbCalZeroLineEdit, self.biCarbCal2ulLineEdit, self.biCarbCal4ulLineEdit, self.biCarbCal6ulLineEdit, self.o2CalibrationLineEdit])

        # Initializing QLabels
        self.biCarbCo2Label = QtWidgets.QLabel("BiCarb/CO2")
        self.o2CalibrationLabel = QtWidgets.QLabel("O2 Calibration")
        self.hclLabel = QtWidgets.QLabel("HCL")

        # Creating a QGrid Layout
        self.biCarbCo2BiCarbCalGridLayout = QtWidgets.QGridLayout()
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCo2Label, 1, 1, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCo2Button, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCo2LineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.hclLabel, 3, 1, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCalZeroButton, 4, 1, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCalZeroLineEdit, 4, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCal2ulButton, 5, 1, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCal2ulLineEdit, 5, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCal4ulButton, 6, 1, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCal4ulLineEdit, 6, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCal6ulButton, 7, 1, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.biCarbCal6ulLineEdit, 7, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.o2CalibrationLabel, 8, 1, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.biCarbCo2BiCarbCalGridLayout.addWidget(self.o2CalibrationLineEdit, 9, 1, 1, 2, alignment=QtCore.Qt.AlignCenter) # Main Layout 2
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(1,1)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(2,2)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(3,1)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(4,1)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(5,1)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(6,1)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(7,1)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(8,1)
        self.biCarbCo2BiCarbCalGridLayout.setRowStretch(9,1)
        #################################################################################################



        ########################{CO2 Zero Blank Extract} AND {CO2 O2 LineEdit Layout} #############################

        # Initializing line edits
        self.co2LineEdit1 = LineEdit()
        self.co2LineEdit2 = LineEdit()
        self.co2LineEdit3 = LineEdit()
        self.co2LineEdit4 = LineEdit()
        self.o2LineEdit1 = LineEdit()
        self.o2LineEdit2 = LineEdit()
        self.o2LineEdit3 = LineEdit()
        self.o2LineEdit4 = LineEdit()

        self.co2ZeroLineEdit1 = LineEdit()
        self.co2ZeroLineEdit2 = LineEdit()

        self.blankSlope44LineEdit = LineEdit()
        self.extractSlope44LineEdit = LineEdit()

        self.blankSlope45LineEdit = LineEdit()
        self.extractSlope45LineEdit = LineEdit()

        self.lineEditList.extend([self.co2LineEdit1, self.co2LineEdit2, self.co2LineEdit3, self.co2LineEdit4, self.o2LineEdit1, self.o2LineEdit2, self.o2LineEdit3, self.o2LineEdit4])
        self.lineEditList.extend([self.co2ZeroLineEdit1, self.co2ZeroLineEdit2])

        # Initializing QLabels
        self.co2Label = QtWidgets.QLabel("CO2")
        self.o2Label = QtWidgets.QLabel("O2")

        self.co2Zero44Label =  QtWidgets.QLabel("CO2 Zero\n(Mass 44)")
        self.co2Zero45Label =  QtWidgets.QLabel("CO2 Zero\n(Mass 45)")

        self.blankButton = Button("Blank", 120, 26)
        self.extractButton = Button("Extract", 120, 26)

        self.blankSlopeButton = Button("Blank Slope", 120, 26)
        self.extractSlopeButton = Button("Extract Slope", 120, 26)

        self.co2ZeroButton = Button("CO2 Zero", 120, 26)


        # Creating a QGrid Layout
        self.co2o2GridLayout = QtWidgets.QGridLayout()
        self.co2o2GridLayout.addWidget(self.co2Zero44Label, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.co2Zero45Label, 1, 3, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.co2ZeroButton, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.co2ZeroLineEdit1, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.co2ZeroLineEdit2, 2, 3, alignment=QtCore.Qt.AlignCenter)
        
        self.co2o2GridLayout.addWidget(self.co2Label, 3, 2, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.o2Label, 3, 3, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.blankButton, 4, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.co2LineEdit1, 4, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.o2LineEdit1, 4, 3, alignment=QtCore.Qt.AlignCenter)

        self.co2o2GridLayout.addWidget(self.blankSlopeButton, 5, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.blankSlope44LineEdit, 5, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.blankSlope45LineEdit, 5, 3, alignment=QtCore.Qt.AlignCenter)

        self.co2o2GridLayout.addWidget(self.extractButton, 6, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.co2LineEdit2, 6, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.o2LineEdit2, 6, 3, alignment=QtCore.Qt.AlignCenter)

        self.co2o2GridLayout.addWidget(self.co2LineEdit3, 7, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.o2LineEdit3, 7, 3, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.co2LineEdit4, 8, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.o2LineEdit4, 8, 3, alignment=QtCore.Qt.AlignCenter)

        self.co2o2GridLayout.addWidget(self.extractSlopeButton, 8, 1, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.extractSlope44LineEdit, 8, 2, alignment=QtCore.Qt.AlignCenter)
        self.co2o2GridLayout.addWidget(self.extractSlope45LineEdit, 8, 3, alignment=QtCore.Qt.AlignCenter)
        #################################################################################################



        ########################{CO2 Zero Blank Extract} AND {CO2 O2 LineEdit Layout} ###################

        #Velocity and CO2 O2 Concentration Labels
        self.v0Label = QtWidgets.QLabel("V0")
        self.vcLabel = QtWidgets.QLabel("Vc")
        self.co2ConcentrationLabel = QtWidgets.QLabel("[CO2]")
        self.o2ConcentrationLabel = QtWidgets.QLabel("[O2]")

        #Velocity and CO2 O2 Concentration Text Edit
        self.v0LineEdit = LineEdit()
        self.vcLineEdit = LineEdit()
        self.co2Concentrationv0LineEdit = LineEdit()
        self.o2Concentrationv0LineEdit = LineEdit()

        self.lineEditList.extend([self.v0LineEdit, self.vcLineEdit, self.co2Concentrationv0LineEdit, self.o2Concentrationv0LineEdit])

        self.velocityConcentrationGridLayout = QtWidgets.QGridLayout()
        self.velocityConcentrationGridLayout.addWidget(self.v0Label, 1, 1, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.vcLabel, 1, 2, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.co2ConcentrationLabel, 1, 3, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.o2ConcentrationLabel, 1, 4, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.v0LineEdit, 2, 1, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.vcLineEdit, 2, 2, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.co2Concentrationv0LineEdit, 2, 3, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.addWidget(self.o2Concentrationv0LineEdit, 2, 4, alignment=QtCore.Qt.AlignCenter)
        self.velocityConcentrationGridLayout.setColumnStretch(1,1)
        self.velocityConcentrationGridLayout.setColumnStretch(2,1)
        self.velocityConcentrationGridLayout.setColumnStretch(3,1)
        self.velocityConcentrationGridLayout.setColumnStretch(4,1)
        

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
        self.table.setColumnCount(4)

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

        self.calculationButtonsFrameHLayout = QtWidgets.QHBoxLayout()
        self.calculationButtonsFrameHLayout.addLayout(self.o2ZeroCo2CalGridLayout)
        self.calculationButtonsFrameHLayout.addLayout(self.biCarbCo2BiCarbCalGridLayout)
        self.calculationButtonsFrameHLayout.addLayout(self.co2o2GridLayout)
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

    def customCalculationPlotsUI(self):
        dataToAdd = [("Blank Slope 44", self.blankSlope44LineEdit), ("Blank Slope 45", self.blankSlope45LineEdit),
                     ("Extract Slope 44", self.extractSlope44LineEdit), ("Extract Slope 45", self.extractSlope45LineEdit)]
        self.customCalculationPlots = customCalculationPlot(self.scrollArea, 0.7, self.getVarsDict, self.DefaultXAxisEquiation, self.DefaultYAxisEquiation, self,
                                                            blankSlopeLineEdit44=self.blankSlope44LineEdit, dataToAdd=dataToAdd, user=self.user)
        self.customCalculationPlots.softError.connect(lambda m, s: self.throwTellUserDilog(m, s))
        pass

    def initializeQFrames(self):
        # create invisable resizable widget
        resizableWidget = QtWidgets.QSplitter(QtCore.Qt.Vertical)
        resizableWidget.setFrameShape(QtWidgets.QFrame.NoFrame)
        # Creating a QFrame from User defined QFrame class.
        # Initializing calculation buttons
        self.calculationButtonsUI()
        self.rawDataPlotFrame = RawPlotFrame(self.scrollArea, 0.9, self.application_state, 1, parent=self)
        self.rawDataPlotFrame.softError.connect(lambda t, m: self.throwTellUserDilog(t, m))
        # Initializing calculation plot
        self.calculatedPlotsUI()

        # QTabWidget inside the container frame
        self.tabWidget = QtWidgets.QTabWidget()
        # self.tabbedContainerLayout.addWidget(self.tabWidget)

        # First Tab ###############
        # Layout is set later by self.calculatedPlotsUI()
        self.tabWidget.addTab(self.calculatedPlotsFrame, "Calculated Plots")

        # Second Tab ###############
        # Layout is set later by self.customCalculationPlotsUI()
        # innerScroll = QtWidgets.QScrollArea()
        # innerScroll.setWidgetResizable(True)
        # innerScroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        # innerScroll.setWidget(self.customCalculationPlots)
        # Initialize the custum plot ui elements
        self.customCalculationPlotsUI()

        self.tabWidget.addTab(self.customCalculationPlots, "Calculations")

        # Adding QFrames to the scroll area widget layout.
        resizableWidget.addWidget(self.tabWidget)
        resizableWidget.addWidget(self.rawDataPlotFrame)
        resizableWidget.addWidget(self.calculationButtonsFrame)

        self.scrollAreaWidgetLayout.addWidget(resizableWidget)

    def addCurveAndMeanBar(self):
        pass

    def connectUItoMethods(self):
        """
            Connects all the UI Components to their respective methods.
            :param {_ : }
            :return -> None

            We need to tell the program what to do when a UI component is interacted with (e.g. a button is clicked).
            So we connect the ui elements to methods that define the behavior of the element.
            
        """

        # QFileDialog Folder selection

        # O2 Assay Buffer Zero Button connect method
        self.o2ZeroButton.clicked.connect(lambda: self.o2ZeroButtonPressed(), QtCore.Qt.QueuedConnection)

        # O2 Assay Buffer Zero LineEdit text edited connect method
        self.o2ZeroLineEdit.returnPressed.connect(lambda: self.OnEditedO2AssayCal(), QtCore.Qt.QueuedConnection)

        # Temperature Lineedir text edited connect method
        self.temperatureLineEdit.returnPressed.connect(lambda: self.OnEditedTemp(), QtCore.Qt.QueuedConnection)

        # CO2 Cal buttons connect method
        self.co2CalZeroButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2CalZeroLineEdit, 3, 0, 0), QtCore.Qt.QueuedConnection)
        self.co2Cal6ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2Cal6ulLineEdit, 3, 0, 1000), QtCore.Qt.QueuedConnection)
        self.co2Cal12ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2Cal12ulLineEdit, 3, 0, 2000), QtCore.Qt.QueuedConnection)
        self.co2Cal18ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.co2Cal18ulLineEdit, 3, 0, 3000), QtCore.Qt.QueuedConnection)

        # CO2 Cal LineEdits connect text edited connet method
        self.co2CalZeroLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2CalZeroLineEdit, 3, 0, 0), QtCore.Qt.QueuedConnection)
        self.co2Cal6ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2Cal6ulLineEdit, 3, 0, 1000), QtCore.Qt.QueuedConnection)
        self.co2Cal12ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2Cal12ulLineEdit, 3, 0, 2000), QtCore.Qt.QueuedConnection)
        self.co2Cal18ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.co2Cal18ulLineEdit, 3, 0, 3000), QtCore.Qt.QueuedConnection)
        

        # BiCarb Cal buttons connect method
        self.biCarbCalZeroButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.biCarbCalZeroLineEdit, 3, 1, 0), QtCore.Qt.QueuedConnection)
        self.biCarbCal2ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.biCarbCal2ulLineEdit, 3, 1, 33.3), QtCore.Qt.QueuedConnection)
        self.biCarbCal4ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.biCarbCal4ulLineEdit, 3, 1, 66.6), QtCore.Qt.QueuedConnection)
        self.biCarbCal6ulButton.clicked.connect(lambda: self.GraphMeanButtonPressed(self.biCarbCal6ulLineEdit, 3, 1, 99.9), QtCore.Qt.QueuedConnection)

        # BiCarb Cal LineEdits connect text edited cnnnect method
        self.biCarbCalZeroLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.biCarbCalZeroLineEdit, 3, 1, 0), QtCore.Qt.QueuedConnection)
        self.biCarbCal2ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.biCarbCal2ulLineEdit, 3, 1, 33.3), QtCore.Qt.QueuedConnection)
        self.biCarbCal4ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.biCarbCal4ulLineEdit, 3, 1, 66.6), QtCore.Qt.QueuedConnection)
        self.biCarbCal6ulLineEdit.returnPressed.connect(lambda: self.OnEditedCO2Cal(self.biCarbCal6ulLineEdit, 3, 1, 99.9), QtCore.Qt.QueuedConnection)

        self.o2CalibrationLineEdit.returnPressed.connect(lambda: self.OnEditedO2Cal(), QtCore.Qt.QueuedConnection)
        

        # BiCarb / CO2 button connect method
        self.biCarbCo2Button.clicked.connect(lambda: self.biCarbCo2ButtonPressed(), QtCore.Qt.QueuedConnection)

        # BiCarb / CO2 LineEdit text edited connect method
        self.biCarbCo2LineEdit.returnPressed.connect(lambda: self.OnEditedBiCarbCo2(), QtCore.Qt.QueuedConnection)

        # CO2 Zero button connect method
        self.co2ZeroButton.clicked.connect(self.co2ZeroButtonPressed, QtCore.Qt.QueuedConnection)

        # Blank button connect method
        self.blankButton.clicked.connect(self.blankButtonPressed, QtCore.Qt.QueuedConnection)

        # Extract button connect method
        self.extractButton.clicked.connect(self.extractButtonPressed, QtCore.Qt.QueuedConnection)

        # Add to Table connect method
        self.addToTableButton.clicked.connect(self.addToTableButtonPressed, QtCore.Qt.QueuedConnection)

        # Stop Button connect method
        self.stopButton.clicked.connect(self.stopButtonPressed, QtCore.Qt.QueuedConnection)

        # Purge Table connect method
        self.purgeTableButton.clicked.connect(self.purgeTableButtonPressed, QtCore.Qt.QueuedConnection)

        # Export Table connect method
        self.exportTableButton.clicked.connect(lambda: self.tableFileSave(self.table), QtCore.Qt.QueuedConnection)

        # Copy Table connect method
        self.copyTableRowButton.clicked.connect(lambda: self.copyTableRowButtonPressed(), QtCore.Qt.QueuedConnection)
        ################################## Blank and Extract slope button ##################################

        self.blankSlopeButton.clicked.connect(self.blankSlopeButtonPressed, QtCore.Qt.QueuedConnection)
        self.extractSlopeButton.clicked.connect(self.extractSlopeButtonPressed, QtCore.Qt.QueuedConnection)

        ################################## Custom Plot Calc ##################################

        # Update Calculation Plots from mean bar moved
        self.rawDataPlotFrame.meanBar.sigRegionChangeFinished.connect(lambda: self.customCalculationPlots.updateCustomCalcPlots(self.getAllMeanBarData()), QtCore.Qt.QueuedConnection)

        # Adds delt button to table
        # self.calculationPlotTable.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        # self.calculationPlotTable.customContextMenuRequested.connect(lambda pos: self.customPlotTableContexWindow(self.calculationPlotTable, pos))

    def select_ezview(self):
        logger.info("Selecting EZView file")
        # Open a file dialog to select a folder
        self.rawDataPlotFrame.EZViewPath, _ = QFileDialog.getOpenFileName(
            None,
            "Select a file",
            "",
            "All Files (*);;Text Files (*.txt)"
        )
        if self.rawDataPlotFrame.EZViewPath == "" or self.rawDataPlotFrame.EZViewPath is None:
            logger.info("EZView selection cancelled")
            return

        logger.info(f"EZView file selected: {self.rawDataPlotFrame.EZViewPath}")
        self.setWindowTitle(f"LabView {os.path.basename(self.rawDataPlotFrame.EZViewPath)}")
        self.application_state = "Folder_Selected"
        self.select_ezview_action.setEnabled(False)
        self.select_folder_action.setEnabled(False)

    def select_folder(self):
        logger.info("Selecting folder")
        # Open a file dialog to select a folder
        self.rawDataPlotFrame.folder_path = QFileDialog.getExistingDirectory(self, 'Select a folder')
        if self.rawDataPlotFrame.folder_path == "":
            logger.info("Folder selection cancelled")
            return

        logger.info(f"Folder selected: {self.rawDataPlotFrame.folder_path}")
        self.rawDataPlotFrame.EZViewPath = None

        self.setWindowTitle(f"LabView {os.path.basename(self.rawDataPlotFrame.folder_path)}")
        self.dataObj.setDirectory(self.rawDataPlotFrame.folder_path)
        self.application_state = "Folder_Selected"
        self.select_folder_action.setEnabled(False)
        self.select_ezview_action.setEnabled(False)

################################################# End - User Interface Creation #################################################
#################################################################################################################################

#################################################################################################################################
##################################################### Calculation Helper Methods ################################################

    def autoRangeToData(self, xs, ys, plot, padding):
        """ rescales plot to show all points
                :param {xs : List of x values}
                :param {ys : List of y values}
                :param {plot : Graph}
                :return -> None
        """

        try:
            xMin = min(xs)
            xMax = max(xs)
            yMin = min(ys)
            yMax = max(ys)

            # Adds margens if needed
            if xMin == xMax:
                xMin -= padding
                yMax += padding
            if yMin == yMax:
                yMin -= padding
                yMax += padding

            xPadding = (xMax - xMin) * padding
            yPadding = (yMax - yMin) * padding

            # resizes plot
            plot.setNewXRange(xMin - padding, xMax + xPadding)
            plot.setNewYRange(yMin - padding, yMax + yPadding)
        except:
            pass

    def ensureCustomTableEmptyRow(self, table):
        """ Ensures theres atleat one traling row
            :param    {table: QtWidgets.QTableWidget()}"""
        last = table.rowCount() - 1
        lastHasData = False

        for i in range(table.columnCount()):
            lastData = table.item(last, i)
            try:
                if not lastData.text().strip() == "":
                    lastHasData = True
            except:
                continue

        if lastHasData or last < 0:
            table.insertRow(last+1)

    def getVarsDict(self, data):
        """
        return filled out var dictionary for given data
        :param data: (time, [y0,..y7])
        :return:
        """
        Masses = data[1]

        # list of custom variables
        vars = {"Mass32": Masses[0], "Mass34": Masses[1], "Mass36": Masses[2], "Mass44": Masses[3], "Mass45": Masses[4],
                "Mass46": Masses[5], "Mass47": Masses[6], "Mass49": Masses[7], "Time": data[0],
                "BlankSlope44": self.blankSlope44LineEdit.text(), "BlankSlope45": self.blankSlope45LineEdit.text(), "ExtractSlope44": self.extractSlope44LineEdit.text(), "ExtractSlope45": self.extractSlope45LineEdit.text(),
                "CO2Zero44": self.co2ZeroLineEdit1.text(), "CO2Zero45": self.co2ZeroLineEdit2.text()}
        return vars

    def getAllMeanBarData(self):
        """Gets all data in mean bar range
            return: (x_timestamp, [y0, y1, y2, y3, y4, y5, y6, y7])"""
        try:
            region = self.rawDataPlotFrame.meanBar.getRegion()
            if region is None or len(region) != 2:
                return []
            left, right = region
            # Copy dataPoints with lock to avoid RuntimeError: dictionary changed size during iteration
            with self.sharedData.lock:
                data_snapshot = dict(self.sharedData.dataPoints)
            
            if not data_snapshot:
                return []

            # use numpy for faster filtering if data is large
            keys = np.fromiter(data_snapshot.keys(), dtype=float)
            mask = (keys >= left) & (keys <= right)
            filtered_keys = keys[mask]

            # return as list of (k, v) as expected by caller
            keyValues = [(k, data_snapshot[k]) for k in sorted(filtered_keys)]
            return keyValues
        except Exception as e:
            # self.throwTellUserDilog("Error", "mean bar error")
            return []

################################################# End - Calculation Helper Methods ##############################################
#################################################################################################################################

#################################################################################################################################
##################################################### ButtonPressed Methods #####################################################

    def blankSlopeButtonPressed(self):
        data = self.getAllMeanBarData()
        if data is None or len(data) < 2:
            self.throwTellUserDilog("Error", "Not enough data points in mean bar range for slope calculation")
            return

        slope44, _ = Calculations.getLineOfBestFit([t[0] for t in data], [t[1][3] for t in data])
        slope45, _ = Calculations.getLineOfBestFit([t[0] for t in data], [t[1][4] for t in data])

        self.blankSlope44LineEdit.setText(Calculations.roundIfFloat(str(slope44), 5))
        self.blankSlope45LineEdit.setText(Calculations.roundIfFloat(str(slope45), 5))

    def extractSlopeButtonPressed(self):
        data = self.getAllMeanBarData()
        if data is None or len(data) < 2:
            self.throwTellUserDilog("Error", "Not enough data points in mean bar range for slope calculation")
            return

        slope44, _ = Calculations.getLineOfBestFit([t[0] for t in data], [t[1][3] for t in data])
        slope45, _ = Calculations.getLineOfBestFit([t[0] for t in data], [t[1][4] for t in data])

        self.extractSlope44LineEdit.setText(Calculations.roundIfFloat(str(slope44), 5))
        self.extractSlope45LineEdit.setText(Calculations.roundIfFloat(str(slope45), 5))

    def dataButtonDialogAccepted(self, obj):
        obj.close()

    def startButtonDialogAccepted(self, dlg):
        dlg.close()

    def graphCheckStateChanged(self, checkBox, curve):
        pass

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

    def meanButtonPressed(self, lineEdit, curve):
        """
            When a mean button is pressed, sets the lineEdit with
            the current mean value from the mean bars on a certain curve.
            :param { lineEdit : QLineEdit} -> line edit that will display the mean value
            :param { curve : int} -> int that indicates the curve to take the mean from
            :return -> mean_value
        """
        try:
            # Get the left and right x points from the mean bars
            xleft, xright = self.rawDataPlotFrame.meanBar.getRegion()

            # Copy dataPoints with lock to avoid RuntimeError
            with self.sharedData.lock:
                data_snapshot = dict(self.sharedData.dataPoints)

            # if no data exists, return undefined
            if not data_snapshot:
                self.throwUndefined(lineEdit)
                return None

            keys_list = sorted(data_snapshot.keys())

            # if one or both of the x values is not in the range of the dataset, return undefined
            if (xright < keys_list[0] or xleft > keys_list[-1] or
                     xleft < keys_list[0] or xright > keys_list[-1]):

                self.throwUndefined(lineEdit)
                return None

            else:
                # get mean value between points
                keys_array = np.array(keys_list)

                # Find the closest x values in the data to the x values from the mean bars
                idx_left = np.abs(keys_array - xleft).argmin()
                idx_right = np.abs(keys_array - xright).argmin()

                xleft_actual = keys_list[idx_left]
                xright_actual = keys_list[idx_right]

                # Get mean from graph
                mean_value = Calculations.getMean(data_snapshot, xleft_actual, xright_actual, curve)

                # Set line edit with mean value
                lineEdit.setText(str(mean_value))

                return mean_value
        except Exception as e:
            # print(f"meanButtonPressed error: {e}")
            self.throwUndefined(lineEdit)
            return None

    def GraphMeanButtonPressed(self, lineEdit, curve, graph, concentration, manualEntry=False):
        """
            When a mean button is pressed, calls meanButtonPressed to get mean
            and then graphs concentration vs. mean on the proper graph and gets the slope
            of the line (calibration value).
            :param { lineEdit : QLineEdit} -> line edit that will display the mean value
            :param { curve : int} -> int that indicates the curve to take the mean from
            :param { graph : int} -> 0 if assay graph, 1 if hcl graph
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
                self.throwUndefined(self.biCarbCalLineEdit)
                self.throwUndefined(self.intercept1LineEdit)
            else:
                # set slope line edit
                self.biCarbCalLineEdit.setText(str(round(self.co2BufferCalibration, 4)))

                # find intercept
                intercept = Calculations.calculateIntercept(self.assayBufferData, self.co2BufferCalibration)

                # set intercept line edit
                self.intercept1LineEdit.setText(str(round(intercept, 4)))

        else:
            # find co2 HCL calibration (slope)
            self.co2HCLCalibration = Calculations.calculateSlope(self.hclData)

            if self.co2HCLCalibration == None:
                self.throwUndefined(self.nmolLineEdit)
                self.throwUndefined(self.intercept2LineEdit)
            else:
                # set slope line edit
                self.nmolLineEdit.setText(str(round(self.co2HCLCalibration, 4)))

                # find intercept
                intercept = Calculations.calculateIntercept(self.hclData, self.co2HCLCalibration)

                # set intercept line edit
                self.intercept2LineEdit.setText(str(round(intercept, 4)))

    def co2ZeroButtonPressed(self):
        """
        Sets the CO2Zero Mass 44 and Mass 45 line edits with the mean value
        from the mean bars from the respective curve.
        :param {_ : }
        :return -> None
        """

        # Set mean value from mean bars for Mass 44 graph
        self.co2Zero44Reading = self.meanButtonPressed(self.co2ZeroLineEdit1, 3)

        # Set mean value from mean bars for Mass 45 graph
        self.co2Zero45Reading = self.meanButtonPressed(self.co2ZeroLineEdit2, 4)

    def throwUndefined(self, lineEdit):
        lineEdit.setText('undef')

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

    def o2ZeroButtonPressed(self, manualEntry=False):
        """
        Gets the mean of Mass 32 from the mean bars and uses that mean value to
        get the O2 concentration. Sets the appropirate line edits with
        these values.
        :param {manualEntry: bool} -> Check bit for allowing manual entry of the
        :return -> True or False

        """

        if (manualEntry):

            # use entered value as mean value
            mean_value = float(self.o2ZeroLineEdit.text())
        else:

            # Set mean value from mean bars on the Mass 32 graph
            mean_value = self.meanButtonPressed(self.o2ZeroLineEdit, 0)

        if self.temperatureLineEdit.text():
            try:
                # get the O2 Calbriation
                self.o2Calibration = Calculations.calculate02Calibration(mean_value, self.temperature)

                # set O2 Calibration line edit
                self.o2CalibrationLineEdit.setText(str(round(self.o2Calibration, 4)))
            except:
                pass
        else:
            self.throwUndefined(self.o2CalibrationLineEdit)

    def throwFloatValueWarning(self):
        floatWarningDlg = Dialog(title="WARNING!", buttonCount=1, message="The entered value is not a numerical value!", parent=self)
        floatWarningDlg.buttonBox.accepted.connect(lambda: self.floatWarningAccepted(floatWarningDlg))
        floatWarningDlg.exec()

    def floatWarningAccepted(self, obj):
        obj.close()

    def biCarbCo2ButtonPressed(self, manualEntry=False):
        """
        When the BiCarb/CO2 button is pressed, the ratio of BiCarb to CO2 is calculated and set
        as long as the HCL calibration is not equal to zero
        :param {_ : }
        :return -> None
        """

        if (manualEntry):
            if (self.biCarbCo2LineEdit.text() != ''):
                self.biCarbCo2Ratio = float(self.biCarbCo2LineEdit.text())
            else:
                self.biCarbCo2Ratio = 0
        else:
            if self.co2BufferCalibration != 0 and self.co2HCLCalibration != 0:
                # calculate ratio
                self.biCarbCo2Ratio = self.co2BufferCalibration / self.co2HCLCalibration

                # set line edit with calculation
                self.biCarbCo2LineEdit.setText(str(round(self.biCarbCo2Ratio, 4)))
            else:
                self.throwUndefined(self.biCarbCo2LineEdit)

    def blankButtonPressed(self):
        """
        Executed when the Blank button is pressed.
        Finds the slope from Mass 44 and Mass 45 from the points on the mean bars.
        :param {_ : }
        :return -> None
        """
        logger.info("Blank button pressed")
        try:
            # Get the left and right x points from the mean bars
            xleft, xright = self.rawDataPlotFrame.meanBar.getRegion()
            logger.debug(f"Mean bar region: {xleft} to {xright}")

            # Snapshot data
            data_snapshot = dict(self.sharedData.dataPoints)

            # if no data exists, return undefined
            if not data_snapshot:
                self.throwUndefined(self.co2LineEdit1)
                self.throwUndefined(self.o2LineEdit1)
                return

            keys_list = sorted(data_snapshot.keys())

            # if one or both of the x values is not in the range of the dataset, return undefined
            if (xright < keys_list[0] or xleft > keys_list[-1] or
                     xleft < keys_list[0] or xright > keys_list[-1]):

                self.throwUndefined(self.co2LineEdit1)
                self.throwUndefined(self.o2LineEdit1)
                self.co2Blank = 0
                self.o2Blank = 0
                return

            else:
                # Find the closest x values in the data to the x values from the mean bars
                keys_array = np.array(keys_list)
                idx_left = np.abs(keys_array - xleft).argmin()
                idx_right = np.abs(keys_array - xright).argmin()

                xleft_actual = keys_list[idx_left]
                xright_actual = keys_list[idx_right]

                if xleft_actual == xright_actual:
                    self.throwTellUserDilog("Error", "Not enough data points in mean bar range for slope calculation")
                    return

                # Calculate slope between these two points for graph Mass 44
                self.co2Blank = (data_snapshot[xright_actual][3] - data_snapshot[xleft_actual][3]) / (xright_actual - xleft_actual)

                # Calculate slope between these two points for graph Mass 32
                self.o2Blank = (data_snapshot[xright_actual][0] - data_snapshot[xleft_actual][0]) / (xright_actual - xleft_actual)

                # Set CO2 and O2 line edits
                self.co2LineEdit1.setText(str(round(self.co2Blank, 4)))
                self.o2LineEdit1.setText(str(round(self.o2Blank, 4)))
        except Exception as e:
            logger.error(f"Error in blankButtonPressed: {e}", exc_info=True)
            self.throwUndefined(self.co2LineEdit1)
            self.throwUndefined(self.o2LineEdit1)

    def extractButtonPressed(self):
        """
        Executed when the Extract button is pressed.
        Fills in the first line of line edits with the extract values (slope values taken from the mean bars).
        Second line of line edits are filled with the extract - blank.
        Third line of line edits filled with mean values from Mass 44 and Mass32 from the mean bars.
        Lastly calculates and fills in velocities and concentrations.
        :param {_ : }
        :return -> None
        """
        logger.info("Extract button pressed")
        try:
            ################ First Line ###############

            # Get the left and right x points from the mean bars
            xleft, xright = self.rawDataPlotFrame.meanBar.getRegion()

            # Snapshot data
            data_snapshot = dict(self.sharedData.dataPoints)

            # if no data exists, return undefined
            if not data_snapshot:
                self.throwUndefined(self.co2LineEdit2)
                self.throwUndefined(self.o2LineEdit2)
                return

            keys_list = sorted(data_snapshot.keys())

            # if one or both of the x values is not in the range of the dataset, return undefined
            if (xright < keys_list[0] or xleft > keys_list[-1] or
                     xleft < keys_list[0] or xright > keys_list[-1]):

                self.throwUndefined(self.co2LineEdit2)
                self.throwUndefined(self.o2LineEdit2)
                return

            # Find the closest x values in the data to the x values from the mean bars
            keys_array = np.array(keys_list)
            idx_left = np.abs(keys_array - xleft).argmin()
            idx_right = np.abs(keys_array - xright).argmin()

            xleft_actual = keys_list[idx_left]
            xright_actual = keys_list[idx_right]

            if xleft_actual == xright_actual:
                self.throwTellUserDilog("Error", "Not enough data points in mean bar range for slope calculation")
                return

            # Calculate slope between these two points for graph Mass 44
            self.co2Extract = (data_snapshot[xright_actual][3] - data_snapshot[xleft_actual][3]) / (xright_actual - xleft_actual)

            # Calculate slope between these two points for graph Mass 32
            self.o2Extract = (data_snapshot[xright_actual][0] - data_snapshot[xleft_actual][0]) / (xright_actual - xleft_actual)

            # Set CO2 and O2 line edits
            self.co2LineEdit2.setText(str(round(self.co2Extract, 4)))
            self.o2LineEdit2.setText(str(round(self.o2Extract, 4)))

            ################ Secone Line ###############

            # if Blank has not been found yet, return undefined
            if (self.co2Blank == 0):
                self.throwUndefined(self.co2LineEdit3)
                self.throwUndefined(self.o2LineEdit3)
                return

            # calculate net rate of consumption for CO2 and O2
            self.co2ConsumptionRate = self.co2Extract - self.co2Blank
            self.o2ConsumptionRate = self.o2Extract - self.o2Blank

            # Set Line Edits
            self.co2LineEdit3.setText(str(round(self.co2ConsumptionRate, 4)))
            self.o2LineEdit3.setText(str(round(self.o2ConsumptionRate, 4)))

            ################ Third Line ###############

            # Get mean value from mean bars from Mass 44 and Mass 32 graphs
            # meanButtonPressed already snapshots data
            co2Reading = self.meanButtonPressed(self.co2LineEdit4, 3)
            o2Reading = self.meanButtonPressed(self.o2LineEdit4, 0)
        except Exception as e:
            # print(f"extractButtonPressed error: {e}")
            self.throwUndefined(self.co2LineEdit2)
            self.throwUndefined(self.o2LineEdit2)
            return

        ######### Populate Velocities and Concentrations for Table ########

        # If the o2 calibration or co2 calibration are not defined, return undefined
        if (self.o2Calibration == 0 or self.co2BufferCalibration == 0 or self.biCarbCo2Ratio == 0):
            self.throwUndefined(self.v0LineEdit)
            self.throwUndefined(self.vcLineEdit)
            self.throwUndefined(self.co2Concentrationv0LineEdit)
            self.throwUndefined(self.o2Concentrationv0LineEdit)
            return

        self.vO = self.o2ConsumptionRate * self.o2Calibration * -1
        self.vC = self.co2ConsumptionRate * self.co2BufferCalibration * -1
        self.co2Concentration = (self.co2BufferCalibration * (co2Reading - self.co2Zero44Reading)) / self.biCarbCo2Ratio
        self.o2Concentration = self.o2Calibration * o2Reading

        # Set Line Edits

        self.v0LineEdit.setText(str(round(self.vO, 4)))
        self.vcLineEdit.setText(str(round(self.vC, 4)))
        self.co2Concentrationv0LineEdit.setText(str(round(self.co2Concentration, 4)))
        self.o2Concentrationv0LineEdit.setText(str(round(self.o2Concentration, 4)))

    def addToTableButtonPressed(self):
        """
        Executed when the Add To Table button is pressed.
        Adds the CO2/O2 velocity and concentration values to the table
        and graphs them on the velocity/concentration graph.
        :param {_ : }
        :return -> None
        """
        logger.info("Add To Table button pressed")

        ####  Add values to the table  ####

        # create a new row
        newRowPosition = self.table.rowCount()
        self.table.insertRow(newRowPosition)

        # set values in row (VO, VC, [CO2], [O2])
        self.table.setItem(newRowPosition, 0, QtWidgets.QTableWidgetItem(str(round(self.vO, 4))))
        self.table.setItem(newRowPosition, 1, QtWidgets.QTableWidgetItem(str(round(self.vC, 4))))
        self.table.setItem(newRowPosition, 2, QtWidgets.QTableWidgetItem(str(round(self.co2Concentration, 4))))
        self.table.setItem(newRowPosition, 3, QtWidgets.QTableWidgetItem(str(round(self.o2Concentration, 4))))

        #### Add new table row values to the velocity/concentration graph ####

        self.o2VelocityConcentrationData[self.o2Concentration] = self.vO
        self.co2VelocityConcentrationData[self.co2Concentration] = self.vC

        self.concentrationGraph.plot(list(self.o2VelocityConcentrationData.keys()), list(self.o2VelocityConcentrationData.values()), pen=None, symbol='o',
                                       symbolsize=1, symbolPen=pg.mkPen(color="#00fa9a", width=0), symbolBrush=pg.mkBrush("#00fa9a"))

        self.concentrationGraph2.plot(list(self.co2VelocityConcentrationData.keys()), list(self.co2VelocityConcentrationData.values()), pen=None, symbol='o',
                                       symbolsize=1, symbolPen=pg.mkPen(color="#ff0000", width=0), symbolBrush=pg.mkBrush("#ff0000"))

        self.concentrationGraph.plotItem.getViewBox().autoRange()
        self.concentrationGraph2.plotItem.getViewBox().autoRange()

    def purgeTableButtonPressed(self):
        """
        Executed when Purge Table button is pressed.
        Saves table data to a csv file.
        Clears the table and velocity/concentration graph.
        :param {_ : }
        :return -> None
        """
        logger.info("Purge Table button pressed")
        self.purgeTablepButtonWarning()

    def copyTableRowButtonPressed(self):
        """
        Copies selected table row to clipboard. Can only copy one row at a time
        :param {_ : }
        :return -> None
        """
        # rowIndex = self.table.currentRow()
        rowIndex = self.table.columnCount()
        columnIndex = self.table.columnCount()

        try:
            row = ''
            if len(self.table.selectedItems()) == 0:
                for i in range(self.table.rowCount()):
                    for j in range(self.table.columnCount()):
                        row += self.table.item(i,j).text() + "\t"
                    row += "\n"
            else:
                # copys selected items to clipbord
                rowMin = 0
                rowMax = 0
                columnMin = 0
                columnMax = 0
                for items in self.table.selectedItems():
                    if items.row() < rowMin:
                        rowMin = items.row()
                    if items.row() > rowMax:
                        rowMax = items.row()
                    if items.column() < columnMin:
                        columnMin = items.column()
                    if items.column() > columnMax:
                        columnMax = items.column()

                for i in range(rowMin - 1, rowMax):
                    for j in range(columnMin - 1, columnMax):
                        if self.table.item(i+1, j+1) in self.table.selectedItems():
                            row += self.table.item(i+1, j+1).text()
                        row += "\t"
                    row += "\n"

            # copy row string to clipboard
            cb = QApplication.clipboard()
            cb.clear(mode=cb.Clipboard)
            cb.setText(row, mode=cb.Clipboard)
        except Exception as e:
            logger.error(f"Error in copyTableRowButtonPressed: {e}", exc_info=True)

################################################## End - ButtonPressed Methods ##################################################
#################################################################################################################################


#################################################################################################################################
###################################################### On Edit Line Edits #######################################################
    def onExportFinished(self, path):
        self.throwTellUserDilog(f"Export complete: {path}", str(path))

    def onExportError(self, message):
        self.throwTellUserDilog("Export Error", message)

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

        if self.o2ZeroLineEdit.text():
            try:
                mean_value = float(self.o2ZeroLineEdit.text())
                # get the O2 Calbriation
                self.o2Calibration = Calculations.calculate02Calibration(mean_value, self.temperature)

                # set O2 Calibration line edit
                self.o2CalibrationLineEdit.setText(str(round(self.o2Calibration, 4)))
            except:
                pass

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

    def OnEditedBiCarbCo2(self):

        # check for numerical input
        if (not self.isFloat(self.biCarbCo2LineEdit.text()) and self.biCarbCo2LineEdit.text() != ''):
            #throw execption
            self.throwFloatValueWarning()
            return

        self.biCarbCo2ButtonPressed(True)

#################################################### End - On Edit Line Edits ###################################################
#################################################################################################################################


#################################################################################################################################
####################################################### Raw Plot Methods ########################################################

    def update_plot_data(self, dataPoints):
        """
            Updates the real time plot after reading each row of data points from the file ONLY IF the pause bit is False.
            :param {x_value : Float} -> x point value of the data point.
            :param {y_value : Float} -> list of the y point values of the data point for different plots.
            :return -> None
        """
        logger.debug(f"Updating plot data with {len(dataPoints)} points")
        self.rawDataPlotFrame.update_plot_data(dataPoints)

    def changeGraphRange(self, x):
        pass

    def pauseResumeAction(self):

        """
            Pauses or Resumes the graph plot.
            :param {_ : }
            :return -> None
        """
        logger.info("Pause/Resume action triggered")
        self.rawDataPlotFrame.pauseResumeAction()

    def stopButtonPressed(self):
        logger.info("Stop button pressed")
        self.throwStopButtonWarning()
##################################################### End - Raw Plot Methods ####################################################
#################################################################################################################################


#################################################################################################################################
#################################################### File export and import #####################################################

    def saveCalibrations(self):
        """
        Opens a save file dialog and saves all calibration files to a csv file. Default location is . Default name
        is the date and time.
        """
        logger.info("Saving calibrations")

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
            logger.info(f"Saving calibrations to {path}")
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
        logger.info(f"Loading calibrations from {file_path}")

        with open(file_path[0], newline='') as cal_file:
            reader = csv.reader(cal_file)
            next(reader) # read in header
            data = next(reader) # read in cal data


            for i in range(len(self.calibrationLineEdits)):
                self.calibrationLineEdits[i].setText(data[i])

            # Update values
            self.OnEditedTemp()  # temperature

            self.OnEditedO2Cal()  # O2 Assay Buffer Zero

            self.OnEditedBiCarbCo2()  # BiCarb/Co2 ratio

            # CO2 Assay Buffer Cals

            self.OnEditedCO2Cal(self.calibrationLineEdits[4], 3, 0, 0)
            self.OnEditedCO2Cal(self.calibrationLineEdits[5], 3, 0, 1000)
            self.OnEditedCO2Cal(self.calibrationLineEdits[6], 3, 0, 2000)
            self.OnEditedCO2Cal(self.calibrationLineEdits[7], 3, 0, 3000)

            # CO2 HCl Cals
            self.OnEditedCO2Cal(self.calibrationLineEdits[8], 3, 1, 0)
            self.OnEditedCO2Cal(self.calibrationLineEdits[9], 3, 1, 33.3)
            self.OnEditedCO2Cal(self.calibrationLineEdits[10], 3, 1, 66.6)
            self.OnEditedCO2Cal(self.calibrationLineEdits[11], 3, 1, 99.9)

    def tableFileSave(self, table):
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
            columns = range(table.columnCount()) # get column count

            # open file and write in table contents
            with open(path, 'w') as csvfile:
                writer = csv.writer(csvfile, dialect='excel', lineterminator='\n')

                # write each row into the file
                for row in range(table.rowCount()):
                    writer.writerow(
                        (table.item(row, column).text() if table.item(row, column) is not None else "") for column in columns)

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
        times = list(self.sharedData.dataPoints.keys())
        voltages = list(self.sharedData.dataPoints.values())

        # write lines of data to csv file
        for i in range(len(self.sharedData.dataPoints)):
            row = [i, times[i]*1000, voltages[i][0], voltages[i][1], voltages[i][2], voltages[i][3],
                               voltages[i][4], voltages[i][5], voltages[i][6], voltages[i][7]]

            writer.writerow(row)

        # close file
        file.close

    def saveAllData(self, autosave_path=None, properly_closed=False):
        """
        Saves all line edit values and table contents to a JSON file.
        """
        if autosave_path:
            logger.debug(f"Autosaving all data to {autosave_path}")
            path = autosave_path
            ok = True
        else:
            logger.info("Saving all data")
            path = 'C:\\Users\\' + self.user + '\\Documents\\ApplicationData'
            if not os.path.exists(path):
                os.makedirs(path)

            now = datetime.now()
            file_name = "AllData_" + now.strftime("%d-%m-%y %H-%M-%S") + ".json"

            path, ok = QtWidgets.QFileDialog.getSaveFileName(self, 'Save All Data', os.path.join(path, file_name), "JSON Files (*.json)")

        if ok:
            if not autosave_path:
                logger.info(f"Saving all data to {path}")
            data = {
                "lineEdits": [le.text() for le in self.lineEditList],
                "table": [],
                "customSamplePlotData": [],
                "properly_closed": properly_closed
            }

            for row in range(self.table.rowCount()):
                row_data = []
                for col in range(self.table.columnCount()):
                    item = self.table.item(row, col)
                    row_data.append(item.text() if item is not None else "")
                data["table"].append(row_data)

            # Collect custom sample plot data
            if hasattr(self, 'customCalculationPlots') and self.customCalculationPlots:
                for sample in self.customCalculationPlots.samplePlotData:
                    serialized_sample = []
                    # sample is a list [sampleName, (eqXName, eqXData), (eqYName, eqYData), (var1, var1Data), ..., (extraName, extraVal), ...]
                    for item in sample:
                        if isinstance(item, tuple):
                            # Convert any non-serializable objects (like sympy symbols) to string
                            serialized_sample.append([str(item[0]), item[1]])
                        else:
                            serialized_sample.append(item)
                    data["customSamplePlotData"].append(serialized_sample)

            try:
                with open(path, 'w') as f:
                    json.dump(data, f, indent=4)
                if autosave_path:
                    logger.info(f"Autosave completed successfully to {path}")
                else:
                    logger.info(f"Save completed successfully to {path}")
            except Exception as e:
                logger.error(f"Failed to save data to {path}: {e}", exc_info=True)

    def triggerAutosave(self):
        """
        Triggers the autosave timer.
        """
        logger.debug("Autosave triggered (queuing save with debounce)")
        self.autosave_timer.start()

    def autosaveData(self, properly_closed=False):
        """
        Performs the autosave to a default file.
        """
        logger.info("Autosave starting (timer timeout)")
        path = 'C:\\Users\\' + self.user + '\\Documents\\ApplicationData'
        if not os.path.exists(path):
            os.makedirs(path)
        autosave_path = os.path.join(path, 'autosave.json')
        self.saveAllData(autosave_path=autosave_path, properly_closed=properly_closed)

    def loadAllData(self, file_path=None):
        """
        Loads all line edit values and table contents from a JSON file.
        """
        if file_path:
            logger.info(f"Loading all data from {file_path}")
            path = file_path
            ok = True
        else:
            logger.info("Loading all data")
            path = 'C:\\Users\\' + self.user + '\\Documents\\ApplicationData'
            path, ok = QtWidgets.QFileDialog.getOpenFileName(self, 'Load All Data', path, "JSON Files (*.json)")

        if ok:
            # Block autosave during load
            self.autosave_timer.stop()
            for le in self.lineEditList:
                le.blockSignals(True)
            self.table.blockSignals(True)
            if hasattr(self, 'customCalculationPlots') and self.customCalculationPlots:
                self.customCalculationPlots.calculationPlotTable.blockSignals(True)

            try:
                with open(path, 'r') as f:
                    data = json.load(f)

                # Load line edits
                le_data = data.get("lineEdits", [])
                for i, text in enumerate(le_data):
                    if i < len(self.lineEditList):
                        self.lineEditList[i].setText(text)

                # Load table
                table_data = data.get("table", [])
                self.table.setRowCount(len(table_data))
                
                # Reset concentration data before repopulating
                self.o2VelocityConcentrationData.clear()
                self.co2VelocityConcentrationData.clear()

                for row_idx, row_data in enumerate(table_data):
                    for col_idx, text in enumerate(row_data):
                        if col_idx < self.table.columnCount():
                            self.table.setItem(row_idx, col_idx, QtWidgets.QTableWidgetItem(text))
                    
                    # Extract and store concentration data for graphs (VO, VC, [CO2], [O2])
                    if len(row_data) >= 4:
                        try:
                            vO = float(row_data[0])
                            vC = float(row_data[1])
                            co2Concentration = float(row_data[2])
                            o2Concentration = float(row_data[3])
                            
                            self.o2VelocityConcentrationData[o2Concentration] = vO
                            self.co2VelocityConcentrationData[co2Concentration] = vC
                        except ValueError:
                            logger.warning(f"Invalid numeric data at row {row_idx} while loading table")

                # Update concentration graphs
                if self.o2VelocityConcentrationData:
                    self.concentrationGraph.plot(list(self.o2VelocityConcentrationData.keys()), list(self.o2VelocityConcentrationData.values()), pen=None, symbol='o',
                                                   symbolsize=1, symbolPen=pg.mkPen(color="#00fa9a", width=0), symbolBrush=pg.mkBrush("#00fa9a"))
                
                if self.co2VelocityConcentrationData:
                    self.concentrationGraph2.plot(list(self.co2VelocityConcentrationData.keys()), list(self.co2VelocityConcentrationData.values()), pen=None, symbol='o',
                                                   symbolsize=1, symbolPen=pg.mkPen(color="#ff0000", width=0), symbolBrush=pg.mkBrush("#ff0000"))

                self.concentrationGraph.plotItem.getViewBox().autoRange()
                self.concentrationGraph2.plotItem.getViewBox().autoRange()

                # Load custom sample plot data
                custom_data = data.get("customSamplePlotData", [])
                if hasattr(self, 'customCalculationPlots') and self.customCalculationPlots:
                    # Clear existing sample data first
                    self.customCalculationPlots.clearSampleData()
                    
                    # Reconstruct and populate
                    for serialized_sample in custom_data:
                        reconstructed_sample = []
                        for item in serialized_sample:
                            if isinstance(item, list) and len(item) == 2:
                                reconstructed_sample.append(tuple(item))
                            else:
                                reconstructed_sample.append(item)
                        
                        self.customCalculationPlots.samplePlotData.append(reconstructed_sample)
                        
                        # Also need to populate the table UI in customCalculationPlot
                        # Assuming the first element is the sample name
                        if reconstructed_sample:
                            sampleName = reconstructed_sample[0]
                            self.customCalculationPlots.calculationPlotTable.insertRow(0)
                            self.customCalculationPlots.calculationPlotTable.setItem(0, 0, QtWidgets.QTableWidgetItem(str(sampleName)))

                # Trigger updates for edited line edits
                self.OnEditedTemp()
                self.OnEditedO2Cal()
                self.OnEditedBiCarbCo2()

                # Calibration line edits
                if len(self.calibrationLineEdits) >= 12:
                    self.OnEditedCO2Cal(self.calibrationLineEdits[4], 3, 0, 0)
                    self.OnEditedCO2Cal(self.calibrationLineEdits[5], 3, 0, 1000)
                    self.OnEditedCO2Cal(self.calibrationLineEdits[6], 3, 0, 2000)
                    self.OnEditedCO2Cal(self.calibrationLineEdits[7], 3, 0, 3000)
                    self.OnEditedCO2Cal(self.calibrationLineEdits[8], 3, 1, 0)
                    self.OnEditedCO2Cal(self.calibrationLineEdits[9], 3, 1, 33.3)
                    self.OnEditedCO2Cal(self.calibrationLineEdits[10], 3, 1, 66.6)
                    self.OnEditedCO2Cal(self.calibrationLineEdits[11], 3, 1, 99.9)
            finally:
                # Unblock signals
                for le in self.lineEditList:
                    le.blockSignals(False)
                self.table.blockSignals(False)
                if hasattr(self, 'customCalculationPlots') and self.customCalculationPlots:
                    self.customCalculationPlots.calculationPlotTable.blockSignals(False)

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

    def throwFolderNotSelectedException(self):
        startButtonExceptionDlg = Dialog(title="EXCEPTION!!", buttonCount=1, message="Select the data folder before pressing start button.\nPress Ok to continue.", parent=self)
        startButtonExceptionDlg.buttonBox.accepted.connect(lambda: self.startButtonDialogAccepted(startButtonExceptionDlg))
        startButtonExceptionDlg.exec()

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

        self.clearVelGraph = False
        purgeWarningDlg = Dialog(title="Clear Velocity Graph", buttonCount=2, message="do you want to clear the Velocity Graph.\nPress OK to clear", parent=self)
        purgeWarningDlg.buttonBox.accepted.connect(lambda: (setattr(self, 'clearVelGraph', True), purgeWarningDlg.close()))
        purgeWarningDlg.buttonBox.rejected.connect(lambda: (setattr(self, 'clearVelGraph', False), purgeWarningDlg.close()))
        purgeWarningDlg.exec()

        # clear table
        self.table.setRowCount(0)

        # clear data sets
        self.o2VelocityConcentrationData.clear()
        self.co2VelocityConcentrationData.clear()

        # clear plots
        if self.clearVelGraph:
            self.concentrationGraph.clear()
            self.concentrationGraph2.clear()

        #autoscale other graphs
        self.assayBufferGraph.plotItem.getViewBox().autoRange()
        self.hclGraph.plotItem.getViewBox().autoRange()

    def purgeDiaRejected(self, obj):
        """
        Closes the purge warning dialoge.
        :param {obj: Dialog} -> Purge warning dialog object.
        :return -> None
        """
        obj.close()
        pass

    def throwTellUserDilog(self, title, str):
        """
            Opens a dilog box and displays a message.
        :param title: dilog title
        :param str: meesage
        :return: 
        """
        msg = Dialog(title=title, buttonCount=1, message=str, parent=self)
        msg.buttonBox.accepted.connect(msg.close)
        msg.exec()

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
            if (mean != None):
                self.hclData[concentration] = mean

            self.hclGraph.clear()

            # plot point on the hcl graph
            hclLine = self.hclGraph.plot(list(self.hclData.values()), list(self.hclData.keys()), pen=None, symbol='o',
                                       symbolsize=1, symbolPen=pg.mkPen(color="#00fa9a", width=0), symbolBrush=pg.mkBrush("#00fa9a"))

            self.hclGraph.plotItem.getViewBox().autoRange()

    def clearApplication(self, keepCals):
        """
            When the STOP button is pressed, the application resets. This methods reinitializes the initial
            parameters of the application and clears any saved data unless calibrations are asked to be retained by the user.
            Post this function execution, the application is ready to plot new data.
            :param { keepCals : list(QLineEdit)} -> List of calibration line edit that needs to be retained.
            :return -> None
        """
        logger.info(f"Clearing application (keepCals={keepCals})")

        # Reset all application global variables. These varibales are global to different components of the application.
        self.setWindowTitle("LabView")
        self.application_state = "Idle"
        self.delay = 200

        self.firstPoint = False
        self.fileCheckThreadStarted = False
        self.select_folder_action.setEnabled(True)
        self.select_ezview_action.setEnabled(True)

        self.customCalculationPlots.clearSampleData()
        # Dictionaries to hold data for graphs
        if not keepCals:
            self.assayBufferData = {}
            self.hclData = {}
            self.assayBufferGraph.clear()
            self.hclGraph.clear()
            self.concentrationGraph.clear()
            self.concentrationGraph2.clear()

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
        self.vC = 0
        self.vO = 0
        self.co2Concentration = 0
        self.o2Concentration = 0

        self.co2Zero44Reading = 0
        self.co2Zero45Reading = 0

        # Reset shared data across different components of the application
        self.sharedData.fileList = []
        self.sharedData.dataPoints = {}
        self.sharedData.folderAccessed = False
        self.sharedData.xPoint = 0
        self.sharedData.initialX = None

        # Data Object for getting the points.
        self.dataObj = GetData()

        for lineEdit in self.lineEditList:
            if keepCals:
                if lineEdit.isReadOnly():
                    lineEdit.setText("")
            else:
                lineEdit.setText("")

        self.rawDataPlotFrame.clear()