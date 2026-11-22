"""Launch the Ambit dialog with simulated serial devices."""

import math
import sys
import time
from types import SimpleNamespace
from unittest.mock import patch

import serial
import serial.tools.list_ports
from PyQt5 import QtWidgets

from Code.Module_Main_1_3.Application.mainUI.ambit_ui import AmbitDialog


AMBIT_PORT = "SIMULATED_AMBIT"
PULSER_PORT = "SIMULATED_PULSER"


class SimulatedSerial:
    def __init__(self, port, *args, **kwargs):
        if port not in (AMBIT_PORT, PULSER_PORT):
            raise serial.SerialException(f"Simulation cannot open real port {port!r}.")
        self.port = port
        self.pending = bytearray()
        self.started_at = time.monotonic()
        self.measurement_count = 0

    def write(self, data):
        if self.port == PULSER_PORT:
            if not data.startswith((b"DAC,", b"LED_ON,", b"LED_OFF,")):
                raise serial.SerialException(f"Unexpected simulated pulser command: {data!r}")
            self.pending.extend(b"Done\n")
        elif data == b"hello\n":
            self.pending.extend(b"NEW Name\n")
        elif data == b"ww\n":
            self.started_at = time.monotonic()
            self.pending.extend(b"Start\nRun\n")
        elif data == b"G":
            self.measurement_count += 1
            n = self.measurement_count
            signal = 1000 + 200 * math.sin(n * 0.25) + 40 * math.sin(n * 0.73)
            elapsed_ms = int((time.monotonic() - self.started_at) * 1000)
            response = f"T:{elapsed_ms},S:{signal:.3f},R:100,F:0,B:0,SIMULATED:1\n"
            self.pending.extend(response.encode("ascii"))
        elif data == b"E\n":
            self.pending.extend(b"Stop\n")
        elif len(data) != 2 or data[0] != 65:
            raise serial.SerialException(f"Unexpected simulated Ambit command: {data!r}")
        return len(data)

    def read(self, size):
        if not self.pending:
            time.sleep(0.005)
            return b""
        result = bytes(self.pending[:size])
        del self.pending[:size]
        return result

    def flush(self):
        pass

    def close(self):
        pass


def simulated_ports():
    return [
        SimpleNamespace(device=AMBIT_PORT, vid=0x1A86, pid=0x55D4),
        SimpleNamespace(device=PULSER_PORT, vid=0x303A, pid=0x1001),
    ]


def create_simulation_dialog(parent):
    dialog = AmbitDialog(parent)
    dialog.setWindowTitle("Ambit acquisition - SIMULATION ONLY")
    dialog.plot.setTitle("SIMULATED data - not instrument measurements")
    dialog.layout().insertWidget(
        0, QtWidgets.QLabel("SIMULATION ONLY: no hardware is connected. Data is synthetic.")
    )
    dialog.set_protocol([["M", 150, 0.1, 0]], "Built-in simulation: 150 measurements at 0.1 s")
    dialog.offset.setText("0")
    return dialog


def main():
    app = QtWidgets.QApplication(sys.argv)
    parent = QtWidgets.QWidget()
    parent.folder_path = ""
    parent._closing = False
    with patch.object(serial, "Serial", SimulatedSerial), \
            patch.object(serial.tools.list_ports, "comports", simulated_ports):
        dialog = create_simulation_dialog(parent)
        dialog.finished.connect(app.quit)
        dialog.show()
        app.exec_()


if __name__ == "__main__":
    main()
