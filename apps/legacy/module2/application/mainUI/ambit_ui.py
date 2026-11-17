import os
import math
import sys
import threading

import pyqtgraph as pg
import serial.tools.list_ports
from PyQt5 import QtCore, QtWidgets

from ambit_controller import AmbitStopped, load_protocol, run_protocol


# QObject moved to a QThread so serial reads and protocol waits do not block
# the main window. Signals carry measurements and results back to the UI thread.
class AmbitWorker(QtCore.QObject):
    # measurement: Ambit time in seconds and fluorescence.
    # result: status text and whether it represents an error.
    measurement = QtCore.pyqtSignal(float, float)
    result = QtCore.pyqtSignal(str, bool)
    finished = QtCore.pyqtSignal()

    def __init__(self, port, protocol, offset, output_path, pulser_port=None):
        super().__init__()
        self.port = port
        self.protocol = protocol
        self.offset = offset
        self.output_path = output_path
        self.pulser_port = pulser_port
        # The controller checks this event during reads, waits, and sampling.
        self.stopped = threading.Event()

    def run(self):
        # Convert normal completion, user cancellation, and failures into UI
        # status signals. Always signal finished so the thread can quit.
        try:
            run_protocol(self.port, self.protocol, self.offset, self.output_path,
                         self.stopped, self.measurement.emit, self.pulser_port)
        except AmbitStopped:
            self.result.emit("Stopped. Measurements saved to " + self.output_path, False)
        except Exception as exc:
            print(f"Ambit error: {exc}", file=sys.stderr)
            self.result.emit(f"Ambit error: {exc}", True)
        else:
            self.result.emit("Completed. Measurements saved to " + self.output_path, False)
        finally:
            self.finished.emit()


# Separate acquisition window: it configures the controller and plots Ambit
# data without replacing the mass-spectrometer plots or calculations.
class AmbitDialog(QtWidgets.QDialog):
    def __init__(self, parent):
        super().__init__(parent)
        self.setWindowTitle("Ambit acquisition")
        self.resize(800, 600)
        # Keep the active worker and thread alive until the run has finished.
        # Plot arrays are local to this dialog and reset for each new run.
        self.protocol = None
        self.worker = None
        self.thread = None
        self.output_path = None
        self.x_values = []
        self.y_values = []

        # The port is editable for cases where USB identification is unavailable.
        # Offset is supplied by the user; the application does not measure it.
        self.ports = QtWidgets.QComboBox()
        self.ports.setEditable(True)
        self.pulser_ports = QtWidgets.QComboBox()
        self.pulser_ports.setEditable(True)
        self.refresh_button = QtWidgets.QPushButton("Refresh ports")
        self.protocol_label = QtWidgets.QLabel("No protocol selected")
        self.load_button = QtWidgets.QPushButton("Load protocol")
        self.offset = QtWidgets.QLineEdit()
        self.offset.setPlaceholderText("Required baseline offset")
        self.start_button = QtWidgets.QPushButton("Connect and start")
        self.stop_button = QtWidgets.QPushButton("Stop")
        self.stop_button.setEnabled(False)
        self.status = QtWidgets.QLabel("Light limits are best-effort software safeguards, not a hardware cutoff.")
        self.status.setWordWrap(True)
        self.plot = pg.PlotWidget()
        self.plot.setLabel("left", "Fluorescence (S - offset) / R")
        self.plot.setLabel("bottom", "Ambit time (s)")
        self.curve = self.plot.plot(pen=pg.mkPen("y"))

        # Build the port/protocol/offset controls, run buttons, status, and plot.
        form = QtWidgets.QFormLayout()
        port_row = QtWidgets.QHBoxLayout()
        port_row.addWidget(self.ports)
        port_row.addWidget(self.refresh_button)
        form.addRow("Ambit serial port", port_row)
        form.addRow("External pulser port", self.pulser_ports)
        form.addRow("Protocol", self.protocol_label)
        form.addRow("", self.load_button)
        form.addRow("Signal offset", self.offset)
        buttons = QtWidgets.QHBoxLayout()
        buttons.addWidget(self.start_button)
        buttons.addWidget(self.stop_button)
        layout = QtWidgets.QVBoxLayout(self)
        layout.addLayout(form)
        layout.addLayout(buttons)
        layout.addWidget(self.status)
        layout.addWidget(self.plot)
        self.refresh_button.clicked.connect(self.refresh_ports)
        self.load_button.clicked.connect(self.load)
        self.start_button.clicked.connect(self.start)
        self.stop_button.clicked.connect(self.stop)
        self.refresh_ports()

    def refresh_ports(self):
        # Preserve a previously selected or typed port. Otherwise preselect the
        # Ambit USB ID only when exactly one matching device is found.
        current = self.ports.currentText()
        current_pulser = self.pulser_ports.currentText()
        ports = list(serial.tools.list_ports.comports())
        self.ports.clear()
        self.pulser_ports.clear()
        self.ports.addItems([port.device for port in ports])
        self.pulser_ports.addItems([port.device for port in ports])
        matches = [port.device for port in ports if port.vid == 0x1A86 and port.pid == 0x55D4]
        if current:
            self.ports.setCurrentText(current)
        elif len(matches) == 1:
            self.ports.setCurrentText(matches[0])
        else:
            self.ports.setCurrentIndex(-1)
        pulser_matches = [port.device for port in ports if port.vid == 0x303A and port.pid == 0x1001]
        if current_pulser:
            self.pulser_ports.setCurrentText(current_pulser)
        elif len(pulser_matches) == 1:
            self.pulser_ports.setCurrentText(pulser_matches[0])
        else:
            self.pulser_ports.setCurrentIndex(-1)

    def load(self):
        # Keep the previous protocol if the dialog is cancelled or the new file
        # fails validation; show the user the reason for a failed load.
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Load Ambit protocol", "", "JSON files (*.json)")
        if not path:
            return
        try:
            protocol = load_protocol(path)
        except (OSError, ValueError) as exc:
            QtWidgets.QMessageBox.critical(self, "Invalid protocol", str(exc))
            return
        self.protocol = protocol
        self.protocol_label.setText(os.path.abspath(path))

    def start(self):
        # Do not start a second worker while one is already running. A port,
        # validated protocol, finite baseline offset, and output path are needed.
        if self.thread is not None:
            return
        port = self.ports.currentText().strip()
        if not port or self.protocol is None:
            QtWidgets.QMessageBox.warning(self, "Ambit", "Select a port and load a protocol.")
            return
        pulser_port = self.pulser_ports.currentText().strip()
        if any(step[0] == "A" for step in self.protocol) and not pulser_port:
            QtWidgets.QMessageBox.warning(self, "Ambit", "Select an external pulser port for LED commands.")
            return
        if pulser_port and pulser_port.casefold() == port.casefold():
            QtWidgets.QMessageBox.warning(self, "Ambit", "Ambit and pulser must use different ports.")
            return
        try:
            offset = float(self.offset.text())
        except ValueError:
            QtWidgets.QMessageBox.warning(self, "Ambit", "Enter a numerical signal offset.")
            return
        if not math.isfinite(offset):
            QtWidgets.QMessageBox.warning(self, "Ambit", "The signal offset must be finite.")
            return
        path, _ = QtWidgets.QFileDialog.getSaveFileName(self, "Save new Ambit CSV", "", "CSV files (*.csv)")
        if not path:
            return
        path = os.path.abspath(path)
        # Module 2 watches its acquisition folder for mass-spec files; placing
        # the differently formatted Ambit CSV there would confuse that reader.
        folder = self.parent().folder_path
        if folder and os.path.normcase(os.path.realpath(os.path.dirname(path))) == os.path.normcase(os.path.realpath(folder)):
            QtWidgets.QMessageBox.warning(self, "Ambit", "Save outside the mass-spectrometer acquisition folder.")
            return
        self.output_path = path
        self.x_values.clear()
        self.y_values.clear()
        self.curve.setData([], [])
        # Run the controller on a dedicated thread and deliver plot updates and
        # completion status to this dialog through Qt signals.
        self.thread = QtCore.QThread(self)
        self.worker = AmbitWorker(port, self.protocol, offset, path, pulser_port or None)
        self.worker.moveToThread(self.thread)
        self.thread.started.connect(self.worker.run)
        self.worker.measurement.connect(self.add_measurement)
        self.worker.result.connect(self.show_result)
        self.worker.finished.connect(self.thread.quit)
        self.worker.finished.connect(self.worker.deleteLater)
        self.thread.finished.connect(self.thread_finished)
        self.thread.finished.connect(self.thread.deleteLater)
        # Freeze run configuration until the worker finishes, but keep Stop
        # available. The worker itself owns the shared cancellation event.
        for widget in (self.ports, self.pulser_ports, self.refresh_button, self.load_button, self.offset, self.start_button):
            widget.setEnabled(False)
        self.stop_button.setEnabled(True)
        self.status.setText("Connecting and running protocol...")
        self.thread.start()

    def add_measurement(self, x, y):
        # x is instrument time in seconds; y is (S - offset) / R.
        self.x_values.append(x)
        self.y_values.append(y)
        self.curve.setData(self.x_values, self.y_values)

    def uses_output_folder(self, folder):
        # The main window also uses this check when selecting an acquisition
        # folder after an Ambit output path has already been chosen.
        return (self.output_path is not None
                and os.path.normcase(os.path.realpath(os.path.dirname(self.output_path)))
                == os.path.normcase(os.path.realpath(folder)))

    def show_result(self, message, is_error):
        # Avoid opening an error dialog while the main window is closing; the
        # worker also writes errors to stderr.
        self.status.setText(message)
        if is_error and not self.parent()._closing:
            QtWidgets.QMessageBox.critical(self, "Ambit error", message)

    def stop(self):
        # Setting the event is thread-safe; the controller performs serial
        # cleanup before emitting its final status.
        if self.worker is not None:
            self.worker.stopped.set()
            self.status.setText("Stopping Ambit...")
            self.stop_button.setEnabled(False)

    def shutdown(self):
        # Used when either window closes: request cancellation and wait for the
        # worker thread so the device is not abandoned mid-operation.
        self.stop()
        if self.thread is not None:
            self.thread.quit()
            self.thread.wait()

    def thread_finished(self):
        # Release references and allow the next run to be configured.
        self.worker = None
        self.thread = None
        for widget in (self.ports, self.pulser_ports, self.refresh_button, self.load_button, self.offset, self.start_button):
            widget.setEnabled(True)
        self.stop_button.setEnabled(False)

    def closeEvent(self, event):
        # Closing the Ambit window stops its run, independently of mass-spec.
        self.shutdown()
        super().closeEvent(event)
