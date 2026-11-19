from PyQt5 import QtWidgets, QtCore
import pyqtgraph as pg
import os

from sympy import sympify

from Code.Module_Main_1_3.Application.uiElements.frame import Frame
from Code.Module_Main_1_3.Application.uiElements.graph import Graph
from Code.Module_Main_1_3.Application.uiElements.button import Button
from Code.Module_Main_1_3.Application.uiElements.LineEdit import LineEdit
from Code.Module_Main_1_3.Application.Workers.ExportWorker import ExportWorker
from Code.Module_Main_1_3.Application.Workers.SamplePlotCalcWorker import SamplePlotCalcWorker
from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations

import logging
logger = logging.getLogger(__name__)

class customCalculationPlot(Frame):
    """
    A Custom widget that processes a custom experiment needed by the lab
    """

    # Connects no hard crash warning to a parent
    softError = QtCore.pyqtSignal((str,str))

    def __init__(self, scrollArea, heightFactor, getVars, DefaultXAxisEquiation, DefaultYAxisEquiation, parent,
                 blankSlopeLineEdit44=None, dataToAdd=None, user=None):
        super(customCalculationPlot, self).__init__(scrollArea, heightFactor)
        self.getVars = getVars
        self.DefaultXAxisEquiation = DefaultXAxisEquiation
        self.DefaultYAxisEquiation = DefaultYAxisEquiation
        self.blankSlopeLineEdit44 = blankSlopeLineEdit44
        self.currentPlotData = {}
        self.user = user
        self.parent = parent
        # List of tuples where (name, ref to data)
        self.dataToAdd = dataToAdd

        self.samplePlotData = []
        self.xAxisEquiation = sympify(DefaultXAxisEquiation)
        self.yAxisEquiation = sympify(DefaultYAxisEquiation)
        self.setupUI()
        self.connectSignals()
        self.lastData = None
        
        # Toggle for synchronous vs asynchronous calculation
        # Set to False to run on main thread (sync), True to run on separate thread (async)
        self.useAsync = False
        
        # Throttling timer for custom calculation updates
        # Used prevent overloading crashes, can probable be removed.
        self.calcTimer = QtCore.QTimer()
        self.calcTimer.setSingleShot(True)
        self.calcTimer.setInterval(250)  # Update every 500ms at most
        self.calcTimer.timeout.connect(self._onCalcTimerTimeout)

    def setupUI(self):
        ################################################# Graphs ##############################################

        self.calculationPlotGraph = Graph(100, 100)
        self.calculationPlotGraph.setLabel(axis="bottom", text=str(self.DefaultYAxisEquiation))
        self.calculationPlotGraph.setLabel(axis="left", text=str(self.DefaultXAxisEquiation))

        self.customPlotGraphLayout = QtWidgets.QHBoxLayout()
        self.customPlotGraphLayout.addWidget(self.calculationPlotGraph)
        self.setContentsMargins(0, 10, 0, 0)

        self.calculationPlotGraph2 = Graph(100, 100)
        self.calculationPlotGraph2.setLabel(axis='bottom', text='Time')
        # self.calculationPlotGraph2.setLabel(axis='left', text='d²/dt² Mass44')
        self.calculationPlotGraph2.setLabel(axis='left', text='d/dt Mass44')

        self.calculationPlotGraph2Curve = pg.PlotDataItem(skipFiniteCheck=True, clipToView=True, useOpenGL=True)
        self.calculationPlotGraph2Curve.setPen(color='#4363d8', width=4)
        self.calculationPlotGraph2.setClipToView(True)
        self.calculationPlotGraph2.addItem(self.calculationPlotGraph2Curve)

        self.calculationPlotLbfCurve = pg.PlotDataItem()
        self.calculationPlotLbfCurve.setPen(color=(255, 0, 0), width=2, style=QtCore.Qt.DashLine)
        self.calculationPlotGraph.addItem(self.calculationPlotLbfCurve)

        self.calculationPlotDataPoints = pg.PlotDataItem()
        self.calculationPlotDataPoints.setPen(None)
        self.calculationPlotDataPoints.setSymbol('o')
        self.calculationPlotDataPoints.setSymbolBrush('r')
        self.calculationPlotGraph.addItem(self.calculationPlotDataPoints)

        self.calculationPlotTextItem = pg.TextItem(color=(100, 255, 100), anchor=(1, 0))
        self.calculationPlotGraph.addItem(self.calculationPlotTextItem)

        self.customPlotGraphLayout.addWidget(self.calculationPlotGraph2)
        ################################################# Bottom Bar Layout ##############################################

        self.calculationPlotAddDataButton = Button("Add Data", 120, 26)
        tempLabel = QtWidgets.QLabel("Delta Part:")
        self.samplePlotDeltaPartLineEdit = LineEdit()
        self.samplePlotDeltaPartLineEdit.setReadOnly(False)

        bottomBarLayout = QtWidgets.QGridLayout()
        bottomBarLayout.addWidget(self.calculationPlotAddDataButton, 1, 1)
        bottomBarLayout.addWidget(tempLabel, 1, 2)
        bottomBarLayout.addWidget(self.samplePlotDeltaPartLineEdit, 1, 3)

        sampleNameLabel = QtWidgets.QLabel("Sample Name:")
        self.sampleNameLineEdit = LineEdit()
        self.sampleNameLineEdit.setReadOnly(False)

        ################################################# Table ##############################################

        tableSampleNameLayout = QtWidgets.QFormLayout()
        tableSampleNameLayout.addRow(sampleNameLabel, self.sampleNameLineEdit)

        self.calculationPlotTable = QtWidgets.QTableWidget()
        self.calculationPlotTable.setColumnCount(1)
        self.calculationPlotTable.setHorizontalHeaderLabels(["Samples"])
        self.calculationPlotTable.setRowCount(0)
        self.calculationPlotTable.setEditTriggers(QtWidgets.QAbstractItemView.NoEditTriggers)

        outterCalculationTableWidgetButtons = QtWidgets.QGridLayout()
        self.calculationPlotExportTableButton = Button("Export Table", 120, 26)
        self.calculationPlotClearTableButton = Button("Clear Table", 120, 26)
        outterCalculationTableWidgetButtons.addWidget(self.calculationPlotExportTableButton, 0, 0)
        outterCalculationTableWidgetButtons.addWidget(self.calculationPlotClearTableButton, 0, 1)

        self.calculationPlotButtonLayoutAxisGraph = QtWidgets.QGridLayout()
        self.calculationPlotButtonLayoutAxisGraph.addLayout(self.customPlotGraphLayout, 2, 1)
        self.calculationPlotButtonLayoutAxisGraph.addLayout(bottomBarLayout, 3, 1)

        tableHalfLayout = QtWidgets.QGridLayout()
        tableHalfLayout.addWidget(self.calculationPlotTable, 0, 0)
        tableHalfLayout.addLayout(tableSampleNameLayout, 1, 0)
        tableHalfLayout.addLayout(outterCalculationTableWidgetButtons, 2, 0)

        ################################################# Final ##############################################

        self.customCalculationPlotsLayout = QtWidgets.QGridLayout()
        self.customCalculationPlotsLayout.addLayout(self.calculationPlotButtonLayoutAxisGraph, 1, 1)
        self.customCalculationPlotsLayout.addLayout(tableHalfLayout, 1, 2)
        self.customCalculationPlotsLayout.setColumnStretch(1, 6)
        self.customCalculationPlotsLayout.setColumnStretch(2, 1)
        self.setFrameShape(QtWidgets.QFrame.NoFrame)
        self.setLayout(self.customCalculationPlotsLayout)

    def connectSignals(self):
        self.samplePlotDeltaPartLineEdit.returnPressed.connect(lambda: self.updateCustomCalcPlots(self.lastData), QtCore.Qt.QueuedConnection)
        self.calculationPlotAddDataButton.clicked.connect(lambda: self.addSampleToSampleData(self.lastData), QtCore.Qt.QueuedConnection)
        self.calculationPlotExportTableButton.clicked.connect(self.exportSampleTable, QtCore.Qt.QueuedConnection)
        self.calculationPlotClearTableButton.clicked.connect(self.clearSampleData, QtCore.Qt.QueuedConnection)

    def updateCustomCalcPlots(self, data):
        """stores data to be caclulated when timer triggers"""
        try:
            self.lastData = data
            if not self.calcTimer.isActive():
                self.calcTimer.start()
        except Exception as e:
            self.softError.emit("error",f"Failed to update custom calculation plots {e}")

    def _onCalcTimerTimeout(self):
        """
        processes data, Async run multi threaded but can cause crashes so until fix uses sync
        :return:
        """
        if self.lastData is not None:
            if self.useAsync:
                self.updateCustomCalcPlotsAsync(self.lastData)
            else:
                self.updateCustomCalcPlotsSync(self.lastData)

    def updateCustomCalcPlotsAsync(self, data):
        if data is None or len(data) == 0:
            return

        logger.debug(f"updateCustomCalcPlotsAsync - START (Points: {len(data)})")

        if getattr(self, "_calcRunning", False):
            logger.debug("Calculation already running, skipping")
            return

        self._calcRunning = True

        xexp = self.xAxisEquiation
        yexp = self.yAxisEquiation

        # Snapshot all widget values on the main thread before the worker starts
        widget_snapshot = {
            "BlankSlope44": self.parent.blankSlope44LineEdit.text(),
            "BlankSlope45": self.parent.blankSlope45LineEdit.text(),
            "ExtractSlope44": self.parent.extractSlope44LineEdit.text(),
            "ExtractSlope45": self.parent.extractSlope45LineEdit.text(),
            "CO2Zero44": self.parent.co2ZeroLineEdit1.text(),
            "CO2Zero45": self.parent.co2ZeroLineEdit2.text(),
        }

        logger.debug(f"Pre-extracting data for {len(data)} points")
        pre_extracted = []
        for d in data:
            masses = d[1]
            pre_extracted.append({
                "Mass32": masses[0], "Mass34": masses[1], "Mass36": masses[2],
                "Mass44": masses[3], "Mass45": masses[4], "Mass46": masses[5],
                "Mass47": masses[6], "Mass49": masses[7],
                "Time": d[0],
                **widget_snapshot
            })

        logger.debug("Initializing SamplePlotCalcWorker and QThread")
        self._calcThread = QtCore.QThread()
        self._calcWorker = SamplePlotCalcWorker(
            data=data,
            pre_extracted=pre_extracted,
            xexp=xexp,
            yexp=yexp,
            lineOfBestFit=self.xyGraphLineOfBestFit,
            temp=None,
            deltaPart=self.samplePlotDeltaPartLineEdit.text()
        )

        self._calcWorker.moveToThread(self._calcThread)

        self._calcThread.started.connect(
            self._calcWorker.run
        )

        self._calcWorker.resultReady.connect(
            self.applyCustomCalcResults
        )
        self._calcWorker.userWarning.connect(
            lambda msg: self.softError.emit("Calculation Warning", msg)
        )
        self._calcWorker.error.connect(
            lambda msg: self.softError.emit("Calculation Error", msg)
        )

        self._calcWorker.finished.connect(self._calcThread.quit)
        self._calcWorker.finished.connect(self._calcWorker.deleteLater)
        self._calcThread.finished.connect(self._onThreadFinished)

        logger.debug("Starting calculation thread")
        self._calcThread.start()
        logger.debug("updateCustomCalcPlotsAsync - END")

    def _onThreadFinished(self):
        self._calcRunning = False
        self._calcThread = None
        self._calcWorker = None

    def updateCustomCalcPlotsSync(self, data):
        if data is None or len(data) == 0:
            return

        logger.debug(f"updateCustomCalcPlotsSync - START (Points: {len(data)})")

        xexp = self.xAxisEquiation
        yexp = self.yAxisEquiation

        # Snapshot all widget values on the main thread
        widget_snapshot = {
            "BlankSlope44": self.parent.blankSlope44LineEdit.text(),
            "BlankSlope45": self.parent.blankSlope45LineEdit.text(),
            "ExtractSlope44": self.parent.extractSlope44LineEdit.text(),
            "ExtractSlope45": self.parent.extractSlope45LineEdit.text(),
            "CO2Zero44": self.parent.co2ZeroLineEdit1.text(),
            "CO2Zero45": self.parent.co2ZeroLineEdit2.text(),
        }

        logger.debug(f"Pre-extracting data for {len(data)} points")
        pre_extracted = []
        for d in data:
            masses = d[1]
            pre_extracted.append({
                "Mass32": masses[0], "Mass34": masses[1], "Mass36": masses[2],
                "Mass44": masses[3], "Mass45": masses[4], "Mass46": masses[5],
                "Mass47": masses[6], "Mass49": masses[7],
                "Time": d[0],
                **widget_snapshot
            })

        logger.debug("Initializing SamplePlotCalcWorker")
        self._calcWorker = SamplePlotCalcWorker(
            data=data,
            pre_extracted=pre_extracted,
            xexp=xexp,
            yexp=yexp,
            lineOfBestFit=self.xyGraphLineOfBestFit,
            temp=None,
            deltaPart=self.samplePlotDeltaPartLineEdit.text()
        )

        # Connect signals for errors/warnings (though synchronous, we still want to handle them)
        self._calcWorker.userWarning.connect(
            lambda msg: self.softError.emit("Calculation Warning", msg)
        )
        self._calcWorker.error.connect(
            lambda msg: self.softError.emit("Calculation Error", msg)
        )
        self._calcWorker.resultReady.connect(
            self.applyCustomCalcResults
        )

        logger.debug("Running calculation synchronously")
        self._calcWorker.run()

        # Clean up
        self._calcWorker.userWarning.disconnect()
        self._calcWorker.error.disconnect()
        self._calcWorker.resultReady.disconnect()
        self._calcWorker = None
        
        logger.debug("updateCustomCalcPlotsSync - END")

    @QtCore.pyqtSlot(dict)
    def applyCustomCalcResults(self, res):
        try:
            logger.debug("Applying custom calculation results to UI - BEGIN")
            logger.debug(f"Result keys: {list(res.keys())}")
            if "sampleEquationPlotX" in res:
                logger.debug(f"sampleEquationPlotX len: {len(res['sampleEquationPlotX'])}")
            if "lbfX" in res:
                logger.debug(f"lbfX len: {len(res['lbfX'])}")
            try:
                # logger.debug("Clearing calculationPlotGraph")
                # self.calculationPlotGraph.clear()

                logger.debug("Plotting lbfX, lbfY via setData")
                self.calculationPlotLbfCurve.setData(res["lbfX"], res["lbfY"])

                logger.debug("Plotting sampleEquationPlotX, sampleEquationPlotY via setData")
                self.calculationPlotDataPoints.setData(res["sampleEquationPlotX"], res["sampleEquationPlotY"])

                logger.debug("Rounding results")
                try:
                    rSquared = round(res["rSquared"], 5)
                except:
                    rSquared = "N/A"
                try:
                    delta = round(res["delta_rubisco"], 5)
                except:
                    delta = "N/A"

                logger.debug("Reading blankSlopeLineEdit44")
                try:
                    blankSlopeText = self.blankSlopeLineEdit44.text()
                    blank44OverBestFit = round(float(blankSlopeText) / float(res["slope44"]), 5)
                except:
                    blank44OverBestFit = "N/A"

                # text = pg.TextItem(f"R²={rSquared}\nDelta={delta}\nb44/slope={blank44OverBestFit}", color=(100, 255, 100), anchor=(1, 0))
                self.calculationPlotTextItem.setText(f"R²={rSquared}\nDelta={delta}\nb44/slope={blank44OverBestFit}")

                if len(res["sampleEquationPlotX"]) > 0:
                    logger.debug("Calling autoRangeToData - BEGIN")
                    self.autoRangeToData(res["sampleEquationPlotX"], res["sampleEquationPlotY"], self.calculationPlotGraph, 0.1)
                    logger.debug("Calling autoRangeToData - END")

                logger.debug("Setting text position")
                view = self.calculationPlotGraph.getViewBox()
                x_range, y_range = view.viewRange()
                self.calculationPlotTextItem.setPos(x_range[1], y_range[1])
                # self.calculationPlotGraph.addItem(text)

                if hasattr(self, "calculationPlotGraph2") and res.get("times_smooth") is not None and res.get("d2_m44") is not None:
                    logger.debug("Updating calculationPlotGraph2 - BEGIN")
                    try:
                        deltaPartText = self.samplePlotDeltaPartLineEdit.text()
                        if deltaPartText != "test":
                            d2_m44 = res["d2_m44"]
                            times = res["times_smooth"]
                        else:
                            d2_m44 = res["difference"]
                            times = res["times"]

                        if len(times) > 0 and len(d2_m44) > 0:
                            logger.debug(f"Setting data for calculationPlotGraph2Curve (len={len(times)})")
                            self.calculationPlotGraph2Curve.setData(times, d2_m44)
                            logger.debug("Setting X Range for calculationPlotGraph2")
                            self.calculationPlotGraph2.setNewXRange(times[0], times[-1])
                            logger.debug("Setting Y Range for calculationPlotGraph2")
                            self.calculationPlotGraph2.setNewYRange(min(d2_m44), max(d2_m44))
                    except Exception as e2:
                        logger.error(f"Error in calculationPlotGraph2 update: {e2}")
                    logger.debug("Updating calculationPlotGraph2 - END")

                try:
                    deltaPart = float(self.samplePlotDeltaPartLineEdit.text())
                except:
                    deltaPart = 0

                self.currentPlotData = {
                    "sampleEquationXPlotData": res["sampleEquationPlotX"],
                    "sampleEquationYPlotData": res["sampleEquationPlotY"],
                    "rSquared": rSquared,
                    "delta": delta,
                    "α_total (slope)": res["α_total (slope)"],
                    "delta_rubisco": res["delta_rubisco"],
                    "delta_part": deltaPart,
                    "b44OverSlope": blank44OverBestFit,
                }
                logger.debug("Applying custom calculation results to UI - END")
            except Exception as e:
                logger.error(f"Error in applyCustomCalcResults: {e}")
                self.softError.emit("Plot Update Error", str(e))
        except Exception as e:
            pass

    def autoRangeToData(self, xs, ys, plot, padding):
        try:
            logger.debug("autoRangeToData - xs/ys min/max")
            xMin = min(xs)
            xMax = max(xs)
            yMin = min(ys)
            yMax = max(ys)
            if xMin == xMax:
                xMin -= padding
                xMax += padding
            if yMin == yMax:
                yMin -= padding
                yMax += padding
            xPadding = (xMax - xMin) * padding
            yPadding = (yMax - yMin) * padding
            logger.debug(f"autoRangeToData - Setting X Range: {xMin - xPadding} to {xMax + xPadding}")
            plot.setXRange(xMin - xPadding, xMax + xPadding)
            logger.debug(f"autoRangeToData - Setting Y Range: {yMin - yPadding} to {yMax + yPadding}")
            plot.setYRange(yMin - yPadding, yMax + yPadding)
            logger.debug("autoRangeToData - Done")
        except Exception as e:
            logger.error(f"Error in autoRangeToData: {e}")

    def xyGraphLineOfBestFit(self, xData, yData):
        slope, intercept = Calculations.getLineOfBestFit(xData, yData)
        if slope and intercept:
            xMin, xMax = min(xData), max(xData)
            x = [xMin, xMax]
            y = [slope * xMin + intercept, slope * xMax + intercept]
            return x, y
        return [], []

    def exportSampleTable(self):
        if self.calculationPlotTable.rowCount() == 0:
            self.softError.emit("No Data Found", "no data found")
            return
        path = f'C:\\Users\\{self.user}\\Documents\\TableData'
        if not os.path.exists(path):
            os.makedirs(path)
        path, ok = QtWidgets.QFileDialog.getSaveFileName(
            self, 'Save File', path, "Excel Files (*.xlsx)"
        )
        try:
            if ok:
                self.thread = QtCore.QThread()
                self.worker = ExportWorker(path, self.samplePlotData)
                self.worker.moveToThread(self.thread)
                self.thread.started.connect(self.worker.run)
                self.worker.finished.connect(lambda p: self.softError.emit(f"Export complete: {p}", str(p)))
                self.worker.error.connect(lambda msg: self.softError.emit("Export Error", msg))
                self.worker.finished.connect(self.thread.quit)
                self.worker.finished.connect(self.worker.deleteLater)
                self.thread.finished.connect(self.thread.deleteLater)
                self.thread.start()
        except:
            pass

    def addSampleToSampleData(self, data):

        if not self.currentPlotData:
            self.softError.emit("No Data Found", "no data found")
            return

        #################### Sample Name ####################
        sampleName = self.sampleNameLineEdit.text()
        # checks that sample name is valid
        if not sampleName:
            sampleName = "null sample"
        sampleData = list()
        sampleData.append(sampleName)

        #################### equations plot ####################

        equationXName = self.DefaultXAxisEquiation
        equationYName = self.DefaultYAxisEquiation

        equationXData = self.currentPlotData["sampleEquationXPlotData"]
        equatoinYData = self.currentPlotData["sampleEquationYPlotData"]

        sampleData.append((equationXName, equationXData))
        sampleData.append((equationYName, equatoinYData))

        #################### Raw Data ####################

        allVars = self.xAxisEquiation.free_symbols.union(self.yAxisEquiation.free_symbols)

        rawData = {k: [] for k in allVars}
        for d in data:
            vars = self.getVars(d)
            for v in allVars:
                rawData[v].append(Calculations.roundIfFloat(vars[str(v)], 5))

        for k in rawData.keys():
            sampleData.append((k, rawData[k]))
        #################### Adds extra data elements ####################
        for x, y in self.dataToAdd:
            if type(y) == LineEdit:
                sampleData.append((x, y.text()))
            else:
                sampleData.append((x, y))
        #################### Adds line of best fit ####################
        slope, intecept = Calculations.getLineOfBestFit(equationXData, equatoinYData)
        sampleData.append(("Line Of Best Fit",
                           ["" + Calculations.roundIfFloat(str(slope), 5) + "*x" + " + " + Calculations.roundIfFloat(
                               str(intecept), 5)]))

        #################### Adds R^2 ####################
        r2 = self.currentPlotData["rSquared"]
        sampleData.append(("R^2", [str(r2)]))

        #################### Adds b44OverSlope ####################
        b44OverSlope = self.currentPlotData["b44OverSlope"]
        sampleData.append(("blank slope 44 / slope", [str(b44OverSlope)]))

        #################### Adds Alpha/Delta/Rubisco metrics ####################
        delta_part_val = self.samplePlotDeltaPartLineEdit.text()
        try:
            # α_total (slope)
            sampleData.append(("α_total (slope)", [str(round(self.currentPlotData["α_total (slope)"], 6))]))
        except:
            pass
        try:
            # Δ_part (input)
            delta_part_str = f"{delta_part_val} ({self.currentPlotData["delta_part"] * 1000:.2f} ‰)"
            sampleData.append(("Δ_part (input)", [delta_part_str]))
        except:
            pass
        try:
            # Δ_Rubisco
            delta_r = self.currentPlotData["delta_rubisco"]
            delta_rubisco_str = f"{round(delta_r, 6)} ({delta_r * 1000:.2f} ‰)"
            sampleData.append(("Δ_Rubisco", [delta_rubisco_str]))
        except:
            pass

        #################### Adds Data to save ####################
        self.samplePlotData.append(sampleData)

        # Adds sample to table
        self.calculationPlotTable.insertRow(0)
        self.calculationPlotTable.setItem(0, 0, QtWidgets.QTableWidgetItem(sampleName))

    def clearSampleData(self):
        self.samplePlotData.clear()
        self.calculationPlotTable.clear()
        self.calculationPlotTable.setRowCount(0)
        self.calculationPlotTable.setHorizontalHeaderLabels(["Samples"])

    def ensureCustomTableEmptyRow(self, table):
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

    def clearCostomCalculationPlot(self):
        logger.debug("clearCostomCalculationPlot - BEGIN")
        self.clearSampleData()
        self.calculationPlotGraph.clear()
        self.calculationPlotGraph2Curve.clear()
        logger.debug("clearCostomCalculationPlot - END")
