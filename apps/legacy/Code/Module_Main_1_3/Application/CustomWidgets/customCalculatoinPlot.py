from PyQt5 import QtWidgets, QtCore
from PyQt5.QtCore import Qt, QPoint
import pyqtgraph as pg
import os

from sympy import sympify

from Code.Module_Main_1_3.Application.uiElements.frame import Frame
from Code.Module_Main_1_3.Application.uiElements.graph import Graph
from Code.Module_Main_1_3.Application.uiElements.button import Button
from Code.Module_Main_1_3.Application.uiElements.LineEdit import LineEdit
from Code.Module_Main_1_3.Application.mainUI.ExportWorker import ExportWorker
from Code.Module_Main_1_3.Application.mainUI.SamplePlotCalcWorker import SamplePlotCalcWorker
from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations
from numpy.ma.core import equal

class customCalculationPlot(Frame):
    softError = QtCore.pyqtSignal((str,str))

    def __init__(self, scrollArea, heightFactor, getVars, DefaultXAxisEquiation, DefaultYAxisEquiation,
                 blankSlopeLineEdit44=None, dataToAdd=None, user=None):
        super(customCalculationPlot, self).__init__(scrollArea, heightFactor)
        self.getVars = getVars
        self.DefaultXAxisEquiation = DefaultXAxisEquiation
        self.DefaultYAxisEquiation = DefaultYAxisEquiation
        self.blankSlopeLineEdit44 = blankSlopeLineEdit44
        self.currentPlotData = {}
        self.user = user

        # List of tuples where (name, ref to data)
        self.dataToAdd = dataToAdd

        self.samplePlotData = []
        self.xAxisEquiation = sympify(DefaultXAxisEquiation)
        self.yAxisEquiation = sympify(DefaultYAxisEquiation)
        self.setupUI()
        self.connectSignals()
        self.lastData = None

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
        self.calculationPlotGraph2.setLabel(axis='left', text='d²/dt² Mass44')

        self.calculationPlotGraph2Curve = pg.PlotDataItem(skipFiniteCheck=True, clipToView=True, useOpenGL=True)
        self.calculationPlotGraph2Curve.setPen(color='#4363d8', width=4)
        self.calculationPlotGraph2.setClipToView(True)
        self.calculationPlotGraph2.addItem(self.calculationPlotGraph2Curve)

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
        self.samplePlotDeltaPartLineEdit.returnPressed.connect(lambda: self.updateCustomCalcPlots(self.lastData))
        self.calculationPlotAddDataButton.clicked.connect(lambda: self.addSampleToSampleData(self.lastData))
        self.calculationPlotExportTableButton.clicked.connect(self.exportSampleTable)
        self.calculationPlotClearTableButton.clicked.connect(self.clearSampleData)

    def updateCustomCalcPlots(self, data):
        try:
            self.lastData = data
            self.updateCustomCalcPlotsAsync(data)
        except:
            self.softError.emit(("error","Failed to update custom calculation plots"))

    def updateCustomCalcPlotsAsync(self, data):
        t = getattr(self, "_calcThread", None)
        if t is not None:
            try:
                if t.isRunning():
                    return
            except RuntimeError:
                self._calcThread = None

        xexp = self.xAxisEquiation
        yexp = self.yAxisEquiation

        self._calcThread = QtCore.QThread(self)
        self._calcWorker = SamplePlotCalcWorker(
            data=data,
            xexp=xexp,
            yexp=yexp,
            lineOfBestFit=self.xyGraphLineOfBestFit,
            getVars=self.getVars,
            temp=None,
            deltaPart=self.samplePlotDeltaPartLineEdit.text()
        )

        self._calcWorker.moveToThread(self._calcThread)
        self._calcThread.started.connect(self._calcWorker.run)
        self._calcWorker.resultReady.connect(self.applyCustomCalcResults)
        self._calcWorker.finished.connect(self._calcThread.quit)
        self._calcWorker.finished.connect(self._calcWorker.deleteLater)
        self._calcThread.finished.connect(self._calcThread.deleteLater)
        self._calcThread.finished.connect(lambda: setattr(self, "_calcThread", None))
        self._calcWorker.userWarning.connect(lambda msg: self.softError.emit("Calculation Warning", msg))
        self._calcWorker.error.connect(lambda msg:  self.softError.emit("Calculation Error", msg))
        self._calcThread.start()

    @QtCore.pyqtSlot(dict)
    def applyCustomCalcResults(self, res):
        try:
            self.calculationPlotGraph.clear()
            self.calculationPlotGraph.plot(
                res["lbfX"], res["lbfY"],
                pen=pg.mkPen(color=(255, 0, 0), width=2, style=QtCore.Qt.DashLine)
            )
            self.calculationPlotGraph.plot(
                res["sampleEquationPlotX"], res["sampleEquationPlotY"],
                pen=None, symbol='o', symbolBrush='r'
            )
            try:
                rSquared = round(res["rSquared"], 5)
            except:
                rSquared = "N/A"
            try:
                delta = round(res["delta_rubisco"], 5)
            except:
                delta = "N/A"
            try:
                blank44OverBestFit = round(float(self.blankSlopeLineEdit44.text()) / float(res["slope44"]), 5)
            except:
                blank44OverBestFit = "N/A"

            text = pg.TextItem(f"R²={rSquared}\nDelta={delta}\nb44/slope={blank44OverBestFit}", color=(100, 255, 100), anchor=(1, 0))

            self.autoRangeToData(res["sampleEquationPlotX"], res["sampleEquationPlotY"], self.calculationPlotGraph, 0.1)
            view = self.calculationPlotGraph.getViewBox()
            x_range, y_range = view.viewRange()
            text.setPos(x_range[1], y_range[1])
            self.calculationPlotGraph.addItem(text)

            if hasattr(self, "calculationPlotGraph2") and res.get("times") is not None and res.get("d2_m44") is not None:
                times = res["d2_Time"]
                d2_m44 = res["d2_m44"]
                self.calculationPlotGraph2Curve.setData(times, d2_m44)
                self.calculationPlotGraph2.setNewXRange(times[0], times[-1])
                self.calculationPlotGraph2.setNewYRange(-max(d2_m44), max(d2_m44))

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
        except Exception as e:
            self.softError.emit("Plot Update Error", str(e))

    def autoRangeToData(self, xs, ys, plot, padding):
        try:
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
            plot.setXRange(xMin - xPadding, xMax + xPadding)
            plot.setYRange(yMin - yPadding, yMax + yPadding)
        except:
            pass

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
        # We need to clear the list in place because it's shared
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

    def customPlotTableContexWindow(self, table, position: QPoint):
        row = table.rowAt(position.y())
        table.selectRow(row)
        menu = QtWidgets.QMenu()
        deleteAction = menu.addAction("Delete Row")
        action = menu.exec_(table.viewport().mapToGlobal(position))
        if action == deleteAction:
            row = table.currentRow()
            if row >= 0:
                table.removeRow(row)
                if row == table.rowCount():
                    self.ensureCustomTableEmptyRow(table)

    def clearCostomCalculationPlot(self):
        self.clearSampleData()
        self.calculationPlotGraph.clear()
        self.calculationPlotGraph2Curve.clear()
