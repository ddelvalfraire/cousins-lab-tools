import csv
import importlib
import json
import math
import os
import statistics
import threading
import time
from datetime import datetime, timezone

import serial


# A cooperative stop is distinct from a serial or protocol error, so the UI can
# report a user-requested stop without displaying an error dialog.
class AmbitStopped(Exception):
    pass


PULSER_CHANNELS = {"B": 2, "R": 4}


# A protocol is data in a JSON file, not executable Python. Reject malformed or
# unsupported steps before returning it to the UI.
def load_protocol(path):
    with open(path, encoding="utf-8") as file:
        protocol = json.load(file)
    validate_protocol(protocol)
    return protocol


def _validate_intensity(channel, intensity):
    maximum = 255 if channel == "Ambit" else 4094
    if type(intensity) is not int or not 0 <= intensity <= maximum:
        raise ValueError(f"{channel} intensity must be an integer from 0 to {maximum}.")


# Validate every step before opening the device. Supported forms are:
#   ["M", count, interval_seconds, ambit_actinic]
#   ["W", seconds]
#   ["P"]  (accepted for notebook compatibility; the UI plots continuously)
#   ["A", channel, intensity]  (external LED control; "B"=blue, "R"=red)
def validate_protocol(protocol):
    if not isinstance(protocol, list) or not protocol:
        raise ValueError("The protocol must be a non-empty JSON list.")
    cumulative_time = 0
    for index, step in enumerate(protocol, 1):
        if not isinstance(step, list) or not step:
            raise ValueError(f"Protocol step {index} must be a non-empty list.")
        command = step[0]
        duration = 0
        if command == "M" and len(step) == 4:
            count, interval, actinic = step[1:]
            if type(count) is not int or count < 1:
                raise ValueError(f"Step {index}: measurement count must be a positive integer.")
            if type(interval) not in (int, float) or not math.isfinite(interval) or interval <= 0:
                raise ValueError(f"Step {index}: interval must be a positive finite number.")
            _validate_intensity("Ambit", actinic)
            duration = count * interval
        elif command == "W" and len(step) == 2:
            duration = step[1]
            if type(duration) not in (int, float) or not math.isfinite(duration) or duration < 0:
                raise ValueError(f"Step {index}: wait must be a non-negative finite number.")
        elif command == "P" and len(step) == 1:
            pass
        elif command == "A" and len(step) == 3:
            channel, intensity = step[1], step[2]
            if not isinstance(channel, str) or channel not in PULSER_CHANNELS:
                raise ValueError(f"Step {index}: external LED channel must be B or R.")
            _validate_intensity(channel, intensity)
        else:
            raise ValueError(f"Step {index}: invalid or unsupported command.")
        cumulative_time += duration
        if not math.isfinite(cumulative_time):
            raise ValueError(f"Step {index}: protocol duration is too large.")


def describe_protocol(protocol):
    validate_protocol(protocol)
    elapsed = 0.0
    pulser_used = any(step[0] == "A" for step in protocol)
    ambit = 0
    blue = red = 0 if pulser_used else "unknown"
    lines = []
    for index, step in enumerate(protocol, 1):
        if step[0] == "M":
            ambit = step[3]
            duration = step[1] * step[2]
            action = f"Measure {step[1]} points at {step[2]} s intervals"
        elif step[0] == "W":
            duration = step[1]
            action = f"Wait {duration} s"
        elif step[0] == "A":
            duration = 0
            if step[1] == "B":
                blue = step[2]
            else:
                red = step[2]
            action = f"Set {step[1]} light to {step[2]}"
        else:
            duration = 0
            action = "Plot update (when P-step plotting is enabled)"
        lines.append(
            f"{index}. {elapsed:g} s: {action} "
            f"[Ambit={ambit}, Blue={blue}, Red={red}]"
        )
        elapsed += duration
    lines.append(f"Estimated duration: {elapsed:g} s (excludes communication and other delays).")
    lines.append(
        "Exposure warning: verify safe light intensities, durations, and cooldowns "
        "with the instrument owner. No exposure limits are enforced."
    )
    return "\n".join(lines)


def baseline_mean(path):
    with open(path, newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames is None or "S" not in reader.fieldnames:
            raise ValueError("Baseline CSV must contain an S column.")
        values = []
        for line, row in enumerate(reader, 2):
            try:
                value = float(row["S"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid S value on CSV line {line}.") from exc
            if not math.isfinite(value):
                raise ValueError(f"Non-finite S value on CSV line {line}.")
            values.append(value)
    if not values:
        raise ValueError("Baseline CSV contains no measurements.")
    mean = statistics.fmean(values)
    if not math.isfinite(mean):
        raise ValueError("Baseline mean is not finite.")
    return mean, len(values)


def _pulser_command(pulser, command, stopped):
    pulser.write(command.encode("ascii"))
    pulser.flush()
    _wait_for(pulser, "Done", stopped)


def _wait(seconds, stopped):
    deadline = time.monotonic() + seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        if stopped.wait(min(remaining, 0.02)):
            raise AmbitStopped()


# Assemble one ASCII response from the serial stream. The device's short read
# timeout lets this loop check cancellation and the overall monotonic deadline.
# Empty CR/LF delimiters and non-ASCII bytes are ignored; a partial line that
# never receives a delimiter is rejected on timeout.
def _read_line(device, timeout, stopped):
    deadline = time.monotonic() + timeout
    result = bytearray()
    while time.monotonic() < deadline:
        if stopped.is_set():
            raise AmbitStopped()
        char = device.read(1)
        if char in (b"\r", b"\n"):
            if result:
                return result.decode("ascii")
        elif char and 0 < char[0] < 128:
            result.extend(char)
    raise TimeoutError("Timed out waiting for an Ambit response.")


# Read successive lines until one contains the expected handshake text. The
# timeout applies to the whole wait, not separately to every line.
def _wait_for(device, target, stopped, timeout=1):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        line = _read_line(device, max(0.001, deadline - time.monotonic()), stopped)
        if target in line:
            return
    raise TimeoutError(f"Ambit did not respond with {target!r}.")


# An Ambit measurement starts with T: and contains comma-separated key:value
# fields. T, S, and R are required; any other numeric fields are retained in
# the dictionary. Reject malformed and non-finite values rather than plotting
# or saving a misleading computed result.
def _parse_measurement(line):
    values = {}
    if not line.startswith("T:"):
        raise ValueError(f"Unexpected Ambit measurement: {line!r}")
    for item in line.split(","):
        if ":" in item:
            key, value = item.split(":", 1)
            try:
                values[key] = float(value)
            except ValueError as exc:
                raise ValueError(f"Invalid Ambit value for {key!r}: {value!r}") from exc
            if not math.isfinite(values[key]):
                raise ValueError(f"Non-finite Ambit value for {key!r}.")
    if not all(key in values for key in ("T", "S", "R")):
        raise ValueError("Ambit measurement is missing T, S, or R.")
    return values


def _export_notebook_csv(data_path, output):
    import pandas as pd

    records = []
    with open(data_path, newline="", encoding="utf-8") as data_file:
        reader = csv.DictReader(data_file)
        required = {"raw_response", "ACT", "Blue", "Red"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError("Detailed CSV is missing fields needed for notebook export.")
        for line, row in enumerate(reader, 2):
            if not row.get("raw_response") or any(row.get(key) is None for key in required):
                raise ValueError(f"Incomplete detailed CSV row on line {line}.")
            values = {}
            for item in row["raw_response"].split(","):
                if ":" not in item:
                    continue
                key, value = item.split(":", 1)
                if key and value.isdecimal():
                    values[key] = int(value)
                elif key and value.count(".") == 1 and value.replace(".", "0").isdecimal():
                    values[key] = float(value)
            for key in ("ACT", "Blue", "Red"):
                values[key] = int(row[key]) if row[key] else None
            records.append(values)
    pd.DataFrame(records).to_csv(output, index=False)
    output.flush()


# Execute a validated protocol on a worker thread. `stopped` is a threading
# Event shared with the UI; `on_measurement` receives instrument time in
# seconds and computed fluorescence after each successful CSV write.
def run_protocol(port, protocol, offset, output_path, stopped, on_measurement,
                 pulser_port=None, on_uncorrected=None, notebook_export=False,
                 on_plot_step=None):
    if not math.isfinite(offset):
        raise ValueError("Offset must be a finite number.")
    # Validate again immediately before opening hardware, including when a
    # caller supplies a protocol directly rather than using load_protocol.
    validate_protocol(protocol)
    if any(step[0] == "A" for step in protocol) and not pulser_port:
        raise ValueError("A pulser serial port is required for external LED commands.")
    if pulser_port and pulser_port.casefold() == port.casefold():
        raise ValueError("Ambit and pulser must use different serial ports.")
    if notebook_export:
        importlib.import_module("pandas")
    device = None
    pulser = None
    start_requested = False
    primary_error = None
    notebook_file = None
    try:
        if stopped.is_set():
            raise AmbitStopped()
        metadata_path = str(output_path) + ".metadata.json"
        if os.path.lexists(metadata_path):
            raise FileExistsError(f"Metadata file already exists: {metadata_path}")
        notebook_path = str(output_path) + ".notebook.csv"
        if notebook_export and os.path.lexists(notebook_path):
            raise FileExistsError(f"Notebook CSV already exists: {notebook_path}")
        # Exclusive creation protects existing files. The header is flushed
        # before connecting, so a failed connection can leave a header-only CSV.
        with open(output_path, "x", newline="", encoding="utf-8") as output:
            metadata = {
                "run_started_utc": datetime.now(timezone.utc).isoformat(),
                "protocol": protocol,
                "offset": offset,
                "ambit_port": port,
                "pulser_port": pulser_port if any(step[0] == "A" for step in protocol) else None,
                "notebook_csv": notebook_export,
                "plot_on_p": on_plot_step is not None,
            }
            with open(metadata_path, "x", encoding="utf-8") as metadata_file:
                json.dump(metadata, metadata_file, indent=2, allow_nan=False)
                metadata_file.write("\n")
            writer = csv.writer(output)
            writer.writerow(["timestamp_utc", "T_ms", "S", "R", "F", "B",
                             "offset", "fluorescence", "raw_response",
                             "ACT", "Blue", "Red"])
            output.flush()
            if notebook_export:
                notebook_file = open(notebook_path, "x", newline="", encoding="utf-8")
            ambit_actinic = 0
            external_lights = {"B": None, "R": None}
            if any(step[0] == "A" for step in protocol):
                pulser = serial.Serial(pulser_port, 115200, timeout=0.05, write_timeout=1,
                                       dsrdtr=True, rtscts=False)
                _pulser_command(pulser, "LED_OFF,0,\n", stopped)
                external_lights = {"B": 0, "R": 0}
            # Match the notebook's serial startup sequence. Record that startup
            # was requested before sending "ww" so cleanup also runs if the
            # handshake fails partway through.
            device = serial.Serial(port, 115200, timeout=0.05, write_timeout=1, rtscts=False)
            device.write(b"hello\n")
            _wait_for(device, "NEW Name", stopped)
            start_requested = True
            device.write(b"ww\n")
            _wait_for(device, "Start", stopped)
            _wait_for(device, "Run", stopped)
            device.write(bytes([65, 0]))
            device.flush()
            # Waits and sampling intervals use Event.wait so Stop interrupts them.
            for step in protocol:
                if stopped.is_set():
                    raise AmbitStopped()
                if step[0] == "W":
                    _wait(step[1], stopped)
                elif step[0] == "P" and on_plot_step is not None:
                    on_plot_step()
                elif step[0] == "A":
                    channel, intensity = step[1:]
                    hardware_channel = PULSER_CHANNELS[channel]
                    if intensity:
                        _pulser_command(pulser, f"DAC,{hardware_channel},{intensity},\n", stopped)
                        _pulser_command(pulser, f"LED_ON,{hardware_channel},\n", stopped)
                    else:
                        _pulser_command(pulser, f"LED_OFF,{hardware_channel},\n", stopped)
                    external_lights[channel] = intensity
                elif step[0] == "M":
                    device.write(bytes([65, step[3]]))
                    device.flush()
                    ambit_actinic = step[3]
                    for _ in range(step[1]):
                        if stopped.is_set():
                            raise AmbitStopped()
                        started = time.monotonic()
                        device.write(b"G")
                        device.flush()
                        # A trigger reads one response; T is instrument time in
                        # milliseconds. S and R are the signal and reference.
                        raw = _read_line(device, 0.5, stopped)
                        measurement = _parse_measurement(raw)
                        fluorescence = None
                        if measurement["R"] != 0:
                            fluorescence = (measurement["S"] - offset) / measurement["R"]
                        # This UTC timestamp is assigned by the host after
                        # receiving the response, not by a shared hardware
                        # trigger. F and B are optional; retain the raw line.
                        timestamp = datetime.now(timezone.utc).isoformat()
                        writer.writerow([timestamp, measurement["T"], measurement["S"], measurement["R"],
                                         measurement.get("F", ""), measurement.get("B", ""), offset,
                                         fluorescence if fluorescence is not None else "", raw,
                                         ambit_actinic, external_lights["B"], external_lights["R"]])
                        output.flush()
                        # Preserve the raw row even when R=0, then stop rather
                        # than divide by zero or emit a fabricated plot point.
                        if fluorescence is None:
                            raise ValueError("Ambit returned R=0; raw measurement was saved, but fluorescence is undefined.")
                        on_measurement(measurement["T"] / 1000, fluorescence)
                        if on_uncorrected is not None:
                            on_uncorrected(measurement["T"] / 1000, measurement["S"] / measurement["R"])
                        # Include serial-read time in the interval. If reading
                        # took longer than requested, the next reading starts
                        # without another sleep; precise timing is not assured.
                        remaining = step[2] - (time.monotonic() - started)
                        if remaining > 0:
                            _wait(remaining, stopped)
    # Preserve the original failure while attempting every cleanup operation.
    except Exception as exc:
        primary_error = exc
    finally:
        cleanup_errors = []
        if pulser is not None:
            try:
                pulser.write(b"LED_OFF,0,\n")
                pulser.flush()
                _wait_for(pulser, "Done", threading.Event())
            except (serial.SerialException, OSError, TimeoutError) as exc:
                cleanup_errors.append(f"turning off external LEDs: {exc}")
        if pulser is not None:
            try:
                pulser.close()
            except (serial.SerialException, OSError) as exc:
                cleanup_errors.append(f"closing pulser: {exc}")
        if device is not None:
            # The off and stop writes are best-effort software requests, not a
            # guarantee that hardware has shut down if communication failed.
            if start_requested:
                try:
                    device.write(bytes([65, 0]))
                    device.flush()
                except (serial.SerialException, OSError) as exc:
                    cleanup_errors.append(f"turning off Ambit light: {exc}")
            try:
                device.write(b"E\n")
                device.flush()
                # Use a fresh event so a user cancellation does not prevent
                # waiting for the device's stop acknowledgement.
                if start_requested:
                    _wait_for(device, "Stop", threading.Event())
            except (serial.SerialException, OSError, TimeoutError) as exc:
                cleanup_errors.append(f"stopping Ambit: {exc}")
            try:
                device.close()
            except (serial.SerialException, OSError) as exc:
                cleanup_errors.append(f"closing Ambit: {exc}")
            # Report cleanup failures as well as the original error; otherwise
            # propagate the original stop or failure after closing the device.
        export_error = None
        if notebook_file is not None:
            try:
                with notebook_file:
                    _export_notebook_csv(output_path, notebook_file)
            except (OSError, UnicodeError, ValueError, TypeError, OverflowError, ImportError, csv.Error) as exc:
                export_error = exc
        if cleanup_errors:
            details = "; ".join(cleanup_errors)
            if export_error is not None:
                details += f"; notebook CSV export failed: {export_error}"
            raise RuntimeError(f"Ambit cleanup failed ({details}). Original error: {primary_error}") from primary_error
        if export_error is not None:
            raise RuntimeError(
                f"Notebook CSV export failed: {export_error}. Original error: {primary_error}"
            ) from export_error
    if primary_error is not None:
        raise primary_error
