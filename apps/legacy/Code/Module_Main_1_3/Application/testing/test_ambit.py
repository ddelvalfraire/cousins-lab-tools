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
        self.assertEqual((row["ACT"], row["Blue"], row["Red"]), ("0", "", ""))
        self.assertTrue(row["timestamp_utc"].endswith("+00:00"))
        self.assertEqual(row["raw_response"], "T:100,S:20,R:4,F:5,B:6")
        self.assertFalse(Path(self.output + ".notebook.csv").exists())
        self.assertEqual(self.device.writes[-2:], [bytes([65, 0]), b"E\n"])
        self.assertTrue(self.device.closed)

    def test_records_protocol_light_states_and_uncorrected_values(self):
        pulser = FakePulser()
        self.serial.side_effect = lambda port, *args, **kwargs: pulser if port == "COM2" else self.device
        protocol = [
            ["A", "B", 100], ["M", 1, 0.001, 125],
            ["A", "R", 45], ["M", 1, 0.001, 20],
            ["A", "B", 0], ["M", 1, 0.001, 0],
        ]
        corrected, uncorrected = [], []
        controller.run_protocol(
            "COM1", protocol, 4, self.output, threading.Event(),
            lambda x, y: corrected.append((x, y)), "COM2",
            lambda x, y: uncorrected.append((x, y)),
        )
        with open(self.output, newline="", encoding="utf-8") as file:
            rows = list(csv.DictReader(file))
        self.assertEqual([(r["ACT"], r["Blue"], r["Red"]) for r in rows],
                         [("125", "100", "0"), ("20", "100", "45"), ("0", "0", "45")])
        self.assertEqual(corrected, [(0.1, 4.0)] * 3)
        self.assertEqual(uncorrected, [(0.1, 5.0)] * 3)
        with open(self.output + ".metadata.json", encoding="utf-8") as file:
            metadata = json.load(file)
        self.assertEqual(metadata["protocol"], protocol)
        self.assertEqual(metadata["offset"], 4)
        self.assertTrue(metadata["run_started_utc"].endswith("+00:00"))
        self.assertEqual(metadata["ambit_port"], "COM1")
        self.assertEqual(metadata["pulser_port"], "COM2")

    def test_notebook_export_preserves_dynamic_fields_order_and_light_states(self):
        class ChangingSerial(FakeSerial):
            def write(self, data):
                if data == b"G":
                    self.response = self.responses.pop(0)
                super().write(data)

        device = ChangingSerial()
        device.responses = [b"T:100,S:20,R:4,F:5\n", b"T:200,S:24,R:4,B:6,X:2.5\n"]
        pulser = FakePulser()
        self.serial.side_effect = lambda port, *args, **kwargs: pulser if port == "COM2" else device
        protocol = [["A", "B", 50], ["M", 2, 0.001, 125]]
        controller.run_protocol("COM1", protocol, 4, self.output, threading.Event(),
                                lambda x, y: None, "COM2", notebook_export=True)
        with open(self.output + ".notebook.csv", newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            rows = list(reader)
        self.assertEqual(reader.fieldnames, ["T", "S", "R", "F", "ACT", "Blue", "Red", "B", "X"])
        self.assertEqual(len(rows), 2)
        self.assertEqual((rows[0]["T"], rows[0]["S"], rows[0]["ACT"], rows[0]["Blue"], rows[0]["Red"]),
                         ("100", "20", "125", "50", "0"))
        self.assertEqual((rows[1]["T"], rows[1]["S"], rows[1]["B"], rows[1]["X"]),
                         ("200", "24", "6.0", "2.5"))
        self.assertEqual(rows[1]["F"], "")
        self.assertEqual(rows[0]["X"], "")

    def test_notebook_export_keeps_partial_data_after_cancellation(self):
        stopped = threading.Event()
        def cancel(x, y):
            stopped.set()
        with self.assertRaises(controller.AmbitStopped):
            controller.run_protocol("COM1", [["M", 2, 1, 0]], 4, self.output,
                                    stopped, cancel, notebook_export=True)
        with open(self.output + ".notebook.csv", newline="", encoding="utf-8") as file:
            rows = list(csv.DictReader(file))
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["T"], rows[0]["S"], rows[0]["Blue"]), ("100", "20", ""))
        self.assertTrue(self.device.closed)

    def test_notebook_export_keeps_zero_reference_reading_after_error(self):
        self.device.response = b"T:1,S:20,R:0\n"
        with self.assertRaisesRegex(ValueError, "R=0"):
            controller.run_protocol("COM1", [["M", 1, 0.001, 0]], 4, self.output,
                                    threading.Event(), lambda x, y: None, notebook_export=True)
        with open(self.output + ".notebook.csv", newline="", encoding="utf-8") as file:
            row = next(csv.DictReader(file))
        self.assertEqual((row["T"], row["S"], row["R"]), ("1", "20", "0"))
        self.assertTrue(self.device.closed)

    def test_existing_notebook_export_is_not_overwritten(self):
        path = Path(self.output + ".notebook.csv")
        path.write_text("existing", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            controller.run_protocol("COM1", [["M", 1, 0.001, 0]], 4, self.output,
                                    threading.Event(), lambda x, y: None, notebook_export=True)
        self.assertEqual(path.read_text(encoding="utf-8"), "existing")
        self.assertFalse(Path(self.output).exists())
        self.serial.assert_not_called()

    def test_notebook_export_failure_is_reported_after_device_cleanup(self):
        with patch.object(controller, "_export_notebook_csv", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(RuntimeError, "Notebook CSV export failed: disk full"):
                controller.run_protocol("COM1", [["M", 1, 0.001, 0]], 4, self.output,
                                        threading.Event(), lambda x, y: None, notebook_export=True)
        self.assertTrue(self.device.closed)
        with open(self.output, newline="", encoding="utf-8") as file:
            self.assertEqual(len(list(csv.DictReader(file))), 1)

    def test_notebook_export_rejects_incomplete_detailed_data(self):
        source = Path(self.temp.name) / "incomplete.csv"
        target = Path(self.temp.name) / "notebook.csv"
        for contents in ("S,R\n1,2\n", "raw_response,ACT,Blue,Red\n\"T:1,S:2,R:3\",0\n"):
            source.write_text(contents, encoding="utf-8")
            with self.subTest(contents=contents), target.open("w", encoding="utf-8", newline="") as output:
                with self.assertRaises(ValueError):
                    controller._export_notebook_csv(source, output)

    def test_existing_metadata_is_not_overwritten_or_used(self):
        metadata = Path(self.output + ".metadata.json")
        metadata.write_text("existing")
        with self.assertRaises(FileExistsError):
            self.run_protocol([["M", 1, 0.001, 0]])
        self.assertEqual(metadata.read_text(), "existing")
        self.assertFalse(Path(self.output).exists())
        self.serial.assert_not_called()

    def test_baseline_mean_checks_every_signal(self):
        path = Path(self.temp.name) / "baseline.csv"
        path.write_text("S,R\n10,2\n20,4\n", encoding="utf-8")
        self.assertEqual(controller.baseline_mean(path), (15.0, 2))
        for contents in ("R\n1\n", "S\n", "S\nnan\n", "S\ninvalid\n", "S,R\n,1\n"):
            path.write_text(contents, encoding="utf-8")
            with self.subTest(contents=contents), self.assertRaises(ValueError):
                controller.baseline_mean(path)

    def test_protocol_preview_shows_timing_light_state_and_general_warning(self):
        preview = controller.describe_protocol([
            ["A", "B", 50], ["M", 2, 0.5, 125], ["W", 2], ["A", "B", 0], ["P"],
        ])
        self.assertIn("0 s: Measure 2 points at 0.5 s intervals [Ambit=125, Blue=50, Red=0]", preview)
        self.assertIn("1 s: Wait 2 s", preview)
        self.assertIn("3 s: Set B light to 0 [Ambit=125, Blue=0, Red=0]", preview)
        self.assertIn("Estimated duration: 3 s", preview)
        self.assertIn("No exposure limits are enforced", preview)
        self.assertIn("Blue=unknown, Red=unknown", controller.describe_protocol([["M", 1, 1, 0]]))

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
    def test_notebook_options_export_and_update_only_at_p(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtCore, QtWidgets
        from Code.Module_Main_1_3.Application.mainUI.ambit_ui import AmbitDialog

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        parent = QtWidgets.QWidget()
        parent.folder_path = ""
        parent._closing = False
        with tempfile.TemporaryDirectory() as temp, \
                patch("serial.tools.list_ports.comports", return_value=[]):
            for name, protocol, expected_shown in (
                ("with-p", [["M", 1, 0.01, 0], ["P"], ["M", 1, 0.01, 0]], 1),
                ("without-p", [["M", 2, 0.01, 0]], 0),
            ):
                with self.subTest(name=name):
                    output = str(Path(temp) / (name + ".csv"))
                    device = FakeSerial()
                    with patch.object(controller.serial, "Serial", return_value=device), \
                            patch.object(QtWidgets.QFileDialog, "getSaveFileName", return_value=(output, "CSV")):
                        dialog = AmbitDialog(parent)
                        dialog.set_protocol(protocol, name)
                        dialog.ports.setEditText("COM1")
                        dialog.offset.setText("4")
                        dialog.notebook_export.setChecked(True)
                        dialog.plot_on_p.setChecked(True)
                        dialog.start()
                        self.assertFalse(dialog.plot_on_p.isEnabled())
                        timer = QtCore.QElapsedTimer()
                        timer.start()
                        while dialog.thread is not None and timer.elapsed() < 5000:
                            app.processEvents()
                            threading.Event().wait(0.005)
                        self.assertIsNone(dialog.thread, "Ambit worker did not finish")
                        self.assertIn("Completed", dialog.status.text())
                        self.assertEqual(len(dialog.y_values), 2)
                        plotted = dialog.curve.getData()[1]
                        self.assertEqual(0 if plotted is None else len(plotted), expected_shown)
                        with open(output + ".notebook.csv", newline="", encoding="utf-8") as file:
                            self.assertEqual(len(list(csv.DictReader(file))), 2)
                        with open(output + ".metadata.json", encoding="utf-8") as file:
                            metadata = json.load(file)
                        self.assertTrue(metadata["notebook_csv"])
                        self.assertTrue(metadata["plot_on_p"])
                        dialog.close()
        parent.close()
        app.processEvents()

    def test_loading_protocol_updates_preview_and_invalid_load_keeps_it(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtWidgets
        from Code.Module_Main_1_3.Application.mainUI.ambit_ui import AmbitDialog

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        parent = QtWidgets.QWidget()
        parent.folder_path = ""
        parent._closing = False
        with tempfile.TemporaryDirectory() as temp, \
                patch("serial.tools.list_ports.comports", return_value=[]):
            path = Path(temp) / "protocol.json"
            path.write_text(json.dumps([["M", 2, 0.5, 125]]), encoding="utf-8")
            dialog = AmbitDialog(parent)
            with patch.object(QtWidgets.QFileDialog, "getOpenFileName", return_value=(str(path), "JSON")):
                dialog.load()
                preview = dialog.protocol_preview.toPlainText()
                self.assertIn("Estimated duration: 1 s", preview)
                self.assertIn("Ambit=125", preview)
                path.write_text("invalid", encoding="utf-8")
                with patch.object(QtWidgets.QMessageBox, "critical") as error:
                    dialog.load()
                error.assert_called_once()
                self.assertEqual(dialog.protocol_preview.toPlainText(), preview)
                self.assertEqual(dialog.protocol, [["M", 2, 0.5, 125]])
            dialog.close()
        parent.close()
        app.processEvents()

    def test_baseline_requires_confirmation_before_applying(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtWidgets
        from Code.Module_Main_1_3.Application.mainUI.ambit_ui import AmbitDialog

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        parent = QtWidgets.QWidget()
        parent.folder_path = ""
        parent._closing = False
        with tempfile.TemporaryDirectory() as temp, \
                patch("serial.tools.list_ports.comports", return_value=[]):
            path = Path(temp) / "baseline.csv"
            path.write_text("S\n10\n20\n", encoding="utf-8")
            dialog = AmbitDialog(parent)
            dialog.offset.setText("4")
            with patch.object(QtWidgets.QFileDialog, "getOpenFileName", return_value=(str(path), "CSV")), \
                    patch.object(QtWidgets.QMessageBox, "question", return_value=QtWidgets.QMessageBox.No):
                dialog.calculate_baseline()
                self.assertEqual(dialog.offset.text(), "4")
            with patch.object(QtWidgets.QFileDialog, "getOpenFileName", return_value=(str(path), "CSV")), \
                    patch.object(QtWidgets.QMessageBox, "question", return_value=QtWidgets.QMessageBox.Yes):
                dialog.calculate_baseline()
                self.assertEqual(float(dialog.offset.text()), 15)
            path.write_text("S\nnan\n", encoding="utf-8")
            with patch.object(QtWidgets.QFileDialog, "getOpenFileName", return_value=(str(path), "CSV")), \
                    patch.object(QtWidgets.QMessageBox, "critical") as error:
                dialog.calculate_baseline()
                error.assert_called_once()
                self.assertEqual(float(dialog.offset.text()), 15)
            dialog.close()
        parent.close()
        app.processEvents()

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
                self.assertEqual(dialog.y_values, [4.0])
                self.assertEqual(dialog.raw_y_values, [5.0])
                dialog.show_uncorrected.setChecked(True)
                self.assertTrue(dialog.raw_curve.isVisible())
                dialog.show_uncorrected.setChecked(False)
                self.assertFalse(dialog.raw_curve.isVisible())
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


class AmbitSimulatorTest(unittest.TestCase):
    def test_simulator_plots_and_saves_fluctuating_data_without_hardware(self):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PyQt5 import QtCore, QtWidgets
        from tools import simulate_ambit

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
        parent = QtWidgets.QWidget()
        parent.folder_path = ""
        parent._closing = False
        with tempfile.TemporaryDirectory() as temp, \
                patch.object(controller.serial, "Serial", simulate_ambit.SimulatedSerial), \
                patch("serial.tools.list_ports.comports", simulate_ambit.simulated_ports):
            output = str(Path(temp) / "simulation.csv")
            with patch.object(QtWidgets.QFileDialog, "getSaveFileName", return_value=(output, "CSV")):
                dialog = simulate_ambit.create_simulation_dialog(parent)
                try:
                    self.assertIn("SIMULATION", dialog.windowTitle())
                    self.assertEqual(dialog.ports.currentText(), simulate_ambit.AMBIT_PORT)
                    self.assertEqual(dialog.pulser_ports.currentText(), simulate_ambit.PULSER_PORT)
                    dialog.protocol = [["A", "B", 50], ["M", 30, 0.01, 0], ["A", "B", 0]]
                    dialog.start()
                    timer = QtCore.QElapsedTimer()
                    timer.start()
                    while dialog.thread is not None and timer.elapsed() < 5000:
                        app.processEvents()
                        threading.Event().wait(0.005)
                    self.assertIsNone(dialog.thread, "Simulated run did not finish")
                    self.assertIn("Completed", dialog.status.text())
                    self.assertEqual(len(dialog.y_values), 30)
                    changes = [b - a for a, b in zip(dialog.y_values, dialog.y_values[1:])]
                    self.assertTrue(any(change > 0 for change in changes))
                    self.assertTrue(any(change < 0 for change in changes))
                    self.assertTrue(all(b > a for a, b in zip(dialog.x_values, dialog.x_values[1:])))
                    with open(output, newline="", encoding="utf-8") as file:
                        rows = list(csv.DictReader(file))
                    self.assertEqual(len(rows), 30)
                    self.assertTrue(all("SIMULATED:1" in row["raw_response"] for row in rows))
                    self.assertEqual([float(row["fluorescence"]) for row in rows], dialog.y_values)
                finally:
                    dialog.close()
                    app.processEvents()
        parent.close()

    def test_simulator_rejects_real_port_names(self):
        from tools.simulate_ambit import SimulatedSerial

        with self.assertRaisesRegex(controller.serial.SerialException, "cannot open real port"):
            SimulatedSerial("COM1")


if __name__ == "__main__":
    unittest.main()
