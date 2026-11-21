import csv
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from Code.Module_Main_1_3.Application.mainUI import ambit_controller as controller


# Simulates the Ambit handshake, measurements, and stop acknowledgement.
# The tests use this instead of opening a real serial port or instrument.
class FakeSerial:
    def __init__(self, response=b"T:100,S:20,R:4,F:5,B:6\n", acknowledge_stop=True):
        self.pending = bytearray()
        self.writes = []
        self.response = response
        self.acknowledge_stop = acknowledge_stop
        self.closed = False

    def write(self, data):
        self.writes.append(data)
        if data == b"hello\n":
            self.pending.extend(b"NEW Name\n")
        elif data == b"ww\n":
            self.pending.extend(b"Start\nRun\n")
        elif data == b"G":
            self.pending.extend(self.response)
        elif data == b"E\n" and self.acknowledge_stop:
            self.pending.extend(b"Stop\n")

    def read(self, size):
        if self.pending:
            result = bytes(self.pending[:size])
            del self.pending[:size]
            return result
        threading.Event().wait(0.001)
        return b""

    def flush(self):
        pass

    def close(self):
        self.closed = True


class FakePulser(FakeSerial):
    def write(self, data):
        self.writes.append(data)
        self.pending.extend(b"Done\n")


class AmbitControllerTest(unittest.TestCase):
    # Give each controller test its own output folder and simulated device.
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = str(Path(self.temp.name) / "ambit.csv")
        self.device = FakeSerial()
        self.serial_patch = patch.object(controller.serial, "Serial", return_value=self.device)
        self.serial = self.serial_patch.start()
        self.addCleanup(self.serial_patch.stop)

    def run_protocol(self, protocol, callback=lambda x, y: None, stopped=None, pulser_port=None):
        controller.run_protocol("COM1", protocol, 4, self.output,
                                stopped or threading.Event(), callback, pulser_port)

    def test_load_protocol_and_reject_invalid_commands_before_opening_port(self):
        path = Path(self.temp.name) / "protocol.json"
        path.write_text(json.dumps([["M", 1, 0.1, 0], ["W", 0], ["P"]]))
        self.assertEqual(len(controller.load_protocol(path)), 3)
        for protocol in ([["M", 1, 0, 0]], [["A", "R", 4095]],
                         [["A", "B", -1]], [["A", "B", 1.5]],
                         [["M", 1, 1, 256]]):
            with self.subTest(protocol=protocol), self.assertRaises(ValueError):
                self.run_protocol(protocol)
        self.serial.assert_not_called()
        self.assertFalse(Path(self.output).exists())

    def test_notebook_examples_are_validated(self):
        examples = Path(__file__).resolve().parents[1] / "protocols"
        self.assertEqual(controller.load_protocol(examples / "signal_offset_protocol.json"),
                         [["M", 50, 0.1, 0]])
        for path in (examples / "reference_only").glob("*.json"):
            with self.subTest(path=path):
                self.assertTrue(controller.load_protocol(path))
        self.serial.assert_not_called()

    def test_exposures_and_intensity_changes_are_not_time_limited(self):
        for protocol in (
            [["A", "B", 100], ["M", 10, 1, 0], ["A", "B", 0]],
            [["A", "B", 100], ["W", 9], ["A", "B", 100], ["W", 1]],
            [["A", "B", 50], ["W", 3], ["A", "B", 200]],
            [["A", "R", 500], ["W", 0.5]],
            [["A", "R", 4094], ["W", 120], ["A", "R", 0]],
        ):
            with self.subTest(protocol=protocol):
                controller.validate_protocol(protocol)

    def test_external_and_ambit_commands_execute_and_cleanup(self):
        pulser = FakePulser()
        self.serial.side_effect = lambda port, *args, **kwargs: pulser if port == "COM2" else self.device
        self.run_protocol([["A", "B", 4094], ["M", 1, 0.001, 125],
                           ["A", "B", 1001],
                           ["A", "B", 0], ["M", 1, 0.001, 0]], pulser_port="COM2")
        self.assertEqual(pulser.writes, [b"LED_OFF,0,\n", b"DAC,2,4094,\n", b"LED_ON,2,\n",
                                        b"DAC,2,1001,\n", b"LED_ON,2,\n",
                                        b"LED_OFF,2,\n", b"LED_OFF,0,\n"])
        self.assertIn(bytes([65, 125]), self.device.writes)
        self.assertLess(self.device.writes.index(bytes([65, 125])), self.device.writes.index(b"G"))
        self.assertTrue(pulser.closed)
        self.assertTrue(self.device.closed)

    def test_no_runtime_exposure_cutoff_during_callback(self):
        pulser = FakePulser()
        self.serial.side_effect = lambda port, *args, **kwargs: pulser if port == "COM2" else self.device
        def delayed_callback(x, y):
            time.sleep(0.65)
            self.assertEqual(pulser.writes.count(b"LED_OFF,0,\n"), 1)
        self.run_protocol([["A", "R", 2500], ["M", 1, 0.01, 125]],
                          delayed_callback, pulser_port="COM2")
        self.assertIn(b"DAC,4,2500,\n", pulser.writes)
        self.assertEqual(pulser.writes[-1], b"LED_OFF,0,\n")
        self.assertEqual(self.device.writes[-2:], [bytes([65, 0]), b"E\n"])
        self.assertTrue(pulser.closed)

    def test_completion_and_measurement_failure_turn_off_lights(self):
        for response, expected_error in ((b"T:100,S:20,R:4\n", None), (b"T:1,S:20,R:0\n", ValueError)):
            with self.subTest(response=response):
                pulser = FakePulser()
                device = FakeSerial(response=response)
                self.serial.side_effect = lambda port, *args, **kwargs: pulser if port == "COM2" else device
                self.output = str(Path(self.temp.name) / ("good.csv" if expected_error is None else "bad.csv"))
                protocol = [["A", "R", 50], ["M", 1, 0.001, 150]]
                if expected_error is None:
                    self.run_protocol(protocol, pulser_port="COM2")
                else:
                    with self.assertRaisesRegex(expected_error, "R=0"):
                        self.run_protocol(protocol, pulser_port="COM2")
                self.assertEqual(pulser.writes[-1], b"LED_OFF,0,\n")
                self.assertIn(b"LED_ON,4,\n", pulser.writes)
                self.assertEqual(device.writes[-2:], [bytes([65, 0]), b"E\n"])
                self.assertTrue(pulser.closed)

    def test_pulser_write_failure_is_reported_and_both_devices_closed(self):
        class FailingPulser(FakePulser):
            def write(self, data):
                if data == b"LED_ON,2,\n":
                    raise OSError("pulser disconnected")
                super().write(data)

        pulser = FailingPulser()
        self.serial.side_effect = lambda port, *args, **kwargs: pulser if port == "COM2" else self.device
        with self.assertRaisesRegex(OSError, "pulser disconnected"):
            self.run_protocol([["A", "B", 50]], pulser_port="COM2")
        self.assertEqual(pulser.writes[-1], b"LED_OFF,0,\n")
        self.assertEqual(self.device.writes[-2:], [bytes([65, 0]), b"E\n"])
        self.assertTrue(pulser.closed)
        self.assertTrue(self.device.closed)

    def test_cleanup_shutdown_failure_is_reported(self):
        class FailingCleanupOff(FakePulser):
            def __init__(self):
                super().__init__()
                self.off_attempts = 0

            def write(self, data):
                if data == b"LED_OFF,0,\n":
                    self.off_attempts += 1
                    if self.off_attempts == 2:
                        raise OSError("off failed")
                super().write(data)

        pulser = FailingCleanupOff()
        self.serial.side_effect = lambda port, *args, **kwargs: pulser if port == "COM2" else self.device
        with self.assertRaisesRegex(RuntimeError, "turning off external LEDs: off failed"):
            self.run_protocol([["A", "R", 500], ["M", 1, 0.01, 0]], pulser_port="COM2")
        self.assertEqual(pulser.off_attempts, 2)
        self.assertTrue(pulser.closed)

    def test_external_command_requires_pulser_before_opening(self):
        with self.assertRaisesRegex(ValueError, "pulser"):
            self.run_protocol([["A", "B", 50]])
        self.serial.assert_not_called()
        self.assertFalse(Path(self.output).exists())

    # A successful reading is calculated, emitted, and saved with its UTC
    # timestamp and raw response; shutdown commands are sent and the port closes.
    def test_measurement_saved_and_shutdown_acknowledged(self):
        points = []
        self.run_protocol([["M", 1, 0.001, 0]], lambda x, y: points.append((x, y)))
        self.assertEqual(points, [(0.1, 4.0)])
        with open(self.output, newline="", encoding="utf-8") as file:
            row = next(csv.DictReader(file))
        self.assertEqual(row["fluorescence"], "4.0")
        self.assertTrue(row["timestamp_utc"].endswith("+00:00"))
        self.assertEqual(row["raw_response"], "T:100,S:20,R:4,F:5,B:6")
        self.assertEqual(self.device.writes[-2:], [bytes([65, 0]), b"E\n"])
        self.assertTrue(self.device.closed)

    # A zero reference prevents fluorescence calculation, but the raw reading
    # is still saved and the controller attempts shutdown before raising.
    def test_zero_reference_saves_raw_data_then_stops(self):
        self.device.response = b"T:1,S:20,R:0\n"
        with self.assertRaisesRegex(ValueError, "R=0"):
            self.run_protocol([["M", 1, 0.001, 0]])
        with open(self.output, newline="", encoding="utf-8") as file:
            row = next(csv.DictReader(file))
        self.assertEqual(row["R"], "0.0")
        self.assertEqual(row["fluorescence"], "")
        self.assertTrue(self.device.closed)
        self.assertEqual(self.device.writes[-2:], [bytes([65, 0]), b"E\n"])

    # Cancel after a measurement, while the sampling interval remains, and
    # verify the controller raises AmbitStopped and performs shutdown.
    def test_cancel_during_wait_stops_and_closes(self):
        stopped = threading.Event()
        def cancel(x, y):
            stopped.set()
        with self.assertRaises(controller.AmbitStopped):
            self.run_protocol([["M", 1, 1, 0]], cancel, stopped)
        self.assertTrue(self.device.closed)
        self.assertEqual(self.device.writes[-2:], [bytes([65, 0]), b"E\n"])

    # A missing stop acknowledgement is reported as a cleanup failure, while
    # the simulated serial port is still closed.
    def test_stop_failure_is_reported_and_device_closed(self):
        self.device.acknowledge_stop = False
        with self.assertRaisesRegex(RuntimeError, "cleanup failed"):
            self.run_protocol([["M", 1, 0.001, 0]])
        self.assertTrue(self.device.closed)

    # Existing CSV data is preserved, and the device is never opened when
    # exclusive creation of the output file fails.
    def test_existing_output_is_not_overwritten(self):
        Path(self.output).write_text("existing")
        with self.assertRaises(FileExistsError):
            self.run_protocol([["M", 1, 0.001, 0]])
        self.assertEqual(Path(self.output).read_text(), "existing")
        self.serial.assert_not_called()


class Module2AmbitIntegrationTest(unittest.TestCase):
    def test_menu_folder_guard_and_shutdown(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtWidgets
        from Code.Module_Main_1_3.Application.mainUI.module2 import LabViewModule2

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        with tempfile.TemporaryDirectory() as folder, \
                patch("os.getlogin", return_value="test"), \
                patch("serial.tools.list_ports.comports", return_value=[]):
            window = LabViewModule2(800, 600, app)
            try:
                window.ambit_action.trigger()
                app.processEvents()
                self.assertTrue(window.ambitDialog.isVisible())
                window.ambitDialog.output_path = str(Path(folder) / "ambit.csv")
                with patch.object(QtWidgets.QFileDialog, "getExistingDirectory", return_value=folder), \
                        patch.object(QtWidgets.QMessageBox, "warning") as warning:
                    window.select_folder()
                warning.assert_called_once()
                self.assertEqual(window.folder_path, "")
                with patch.object(window.ambitDialog, "shutdown", wraps=window.ambitDialog.shutdown) as shutdown:
                    window.close()
                    shutdown.assert_called()
            finally:
                window.close()
                app.processEvents()


class AmbitUiTest(unittest.TestCase):
    # An Ambit CSV cannot be saved in the selected mass-spectrometer folder:
    # the UI warns the user without starting a worker or creating a file.
    def test_refuses_to_save_into_mass_spectrometer_folder(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtWidgets
        from Code.Module_Main_1_3.Application.mainUI.ambit_ui import AmbitDialog

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        parent = QtWidgets.QWidget()
        parent._closing = False
        with tempfile.TemporaryDirectory() as temp:
            parent.folder_path = temp
            output = str(Path(temp) / "ambit.csv")
            with patch("serial.tools.list_ports.comports", return_value=[]), \
                    patch.object(QtWidgets.QFileDialog, "getSaveFileName", return_value=(output, "CSV")), \
                    patch.object(QtWidgets.QMessageBox, "warning") as warning, \
                    patch.object(controller.serial, "Serial") as serial_port:
                dialog = AmbitDialog(parent)
                dialog.protocol = [["M", 1, 0.1, 0]]
                dialog.ports.setEditText("COM1")
                dialog.offset.setText("4")
                dialog.start()
                warning.assert_called_once()
                serial_port.assert_not_called()
                self.assertIsNone(dialog.thread)
                self.assertFalse(Path(output).exists())
                dialog.close()
        parent.close()
        app.processEvents()

    # Run the dialog against FakeSerial and process Qt events until the worker
    # finishes; verify the sample appears in the plot and a CSV is created.
    def test_runs_and_plots_with_simulated_serial_device(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtCore, QtWidgets
        from Code.Module_Main_1_3.Application.mainUI.ambit_ui import AmbitDialog

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        parent = QtWidgets.QWidget()
        parent.folder_path = ""
        parent._closing = False
        with tempfile.TemporaryDirectory() as temp:
            output = str(Path(temp) / "ambit.csv")
            device = FakeSerial()
            with patch.object(controller.serial, "Serial", return_value=device), \
                    patch("serial.tools.list_ports.comports", return_value=[]), \
                    patch.object(QtWidgets.QFileDialog, "getSaveFileName", return_value=(output, "CSV")):
                dialog = AmbitDialog(parent)
                dialog.protocol = [["M", 1, 0.001, 0]]
                dialog.ports.setEditText("COM1")
                dialog.offset.setText("4")
                dialog.start()
                timer = QtCore.QElapsedTimer()
                timer.start()
                while dialog.thread is not None and timer.elapsed() < 5000:
                    app.processEvents()
                    threading.Event().wait(0.005)
                self.assertIsNone(dialog.thread, "Ambit worker did not finish")
                self.assertEqual(dialog.x_values, [0.1])
                self.assertIn("Completed", dialog.status.text())
                self.assertTrue(Path(output).exists())
                dialog.close()
        parent.close()

    # Closing the dialog during a long sampling interval cancels the worker,
    # sends shutdown commands, closes the port, and releases the thread.
    def test_closing_dialog_cancels_running_protocol(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtCore, QtWidgets
        from Code.Module_Main_1_3.Application.mainUI.ambit_ui import AmbitDialog

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        parent = QtWidgets.QWidget()
        parent.folder_path = ""
        parent._closing = False
        with tempfile.TemporaryDirectory() as temp:
            output = str(Path(temp) / "ambit.csv")
            device = FakeSerial()
            with patch.object(controller.serial, "Serial", return_value=device), \
                    patch("serial.tools.list_ports.comports", return_value=[]), \
                    patch.object(QtWidgets.QFileDialog, "getSaveFileName", return_value=(output, "CSV")):
                dialog = AmbitDialog(parent)
                dialog.show()
                dialog.protocol = [["M", 1, 60, 0]]
                dialog.ports.setEditText("COM1")
                dialog.offset.setText("4")
                dialog.start()
                timer = QtCore.QElapsedTimer()
                timer.start()
                while not dialog.x_values and timer.elapsed() < 5000:
                    app.processEvents()
                    threading.Event().wait(0.005)
                self.assertEqual(dialog.x_values, [0.1])
                dialog.close()
                app.processEvents()
                self.assertTrue(device.closed)
                self.assertEqual(device.writes[-2:], [bytes([65, 0]), b"E\n"])
                self.assertIsNone(dialog.thread)
        parent.close()


if __name__ == "__main__":
    unittest.main()
