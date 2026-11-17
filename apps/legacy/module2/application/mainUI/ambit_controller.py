import csv
import json
import math
import threading
import time
from datetime import datetime, timezone

import serial


# A cooperative stop is distinct from a serial or protocol error, so the UI can
# report a user-requested stop without displaying an error dialog.
class AmbitStopped(Exception):
    pass


# Notebook suggestions for external LEDs; boundary values use the shorter
# duration where the notebook's ranges overlap. These are not hardware limits.
INTENSITY_LIMITS = ((50, math.inf), (100, 120), (200, 10), (500, 2), (1001, 0.5))
PULSER_CHANNELS = {"B": 2, "R": 4}


# A protocol is data in a JSON file, not executable Python. Reject malformed or
# unsupported steps before returning it to the UI.
def load_protocol(path):
    with open(path, encoding="utf-8") as file:
        protocol = json.load(file)
    validate_protocol(protocol)
    return protocol


def enforce_light_limits(channel, intensity, elapsed_time):
    """Reject an invalid setting or an external LED exposure at its limit."""
    maximum = 255 if channel == "Ambit" else 1000
    if channel not in ("Ambit", "B", "R"):
        raise ValueError(f"Unknown light channel: {channel!r}.")
    if type(intensity) is not int or not 0 <= intensity <= maximum:
        raise ValueError(f"{channel} intensity must be an integer from 0 to {maximum}.")
    if type(elapsed_time) not in (int, float) or not math.isfinite(elapsed_time) or elapsed_time < 0:
        raise ValueError("Light exposure must be a non-negative finite number.")
    if channel == "Ambit" or intensity == 0:
        return
    for upper_bound, duration in INTENSITY_LIMITS:
        if intensity < upper_bound:
            if elapsed_time >= duration:
                raise ValueError(f"{channel} LED at intensity {intensity} reached its {duration:g}s exposure limit.")
            return
    raise ValueError(f"No exposure limit is configured for {channel} intensity {intensity}.")


# Validate every step before opening the device. Supported forms are:
#   ["M", count, interval_seconds, ambit_actinic]
#   ["W", seconds]
#   ["P"]  (accepted for notebook compatibility; the UI plots continuously)
#   ["A", channel, intensity]  (external LED control; "B"=blue, "R"=red)
def validate_protocol(protocol):
    if not isinstance(protocol, list) or not protocol:
        raise ValueError("The protocol must be a non-empty JSON list.")
    active_leds = {}
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
            enforce_light_limits("Ambit", actinic, 0)
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
            started = active_leds[channel][1] if channel in active_leds else cumulative_time
            enforce_light_limits(channel, intensity, cumulative_time - started)
            if intensity == 0:
                active_leds.pop(channel, None)
            else:
                active_leds[channel] = (intensity, started)
        else:
            raise ValueError(f"Step {index}: invalid or unsupported command.")
        cumulative_time += duration
        if not math.isfinite(cumulative_time):
            raise ValueError(f"Step {index}: protocol duration is too large.")
        for channel, (intensity, started) in active_leds.items():
            enforce_light_limits(channel, intensity, cumulative_time - started)


class _LightGuard:
    """Best-effort watchdog; serial and operating-system delays can exceed limits."""
    def __init__(self, pulser):
        self.pulser = pulser
        self.lock = threading.Lock()
        self.active = {}
        self.failure = None
        self.finished = threading.Event()
        self.thread = threading.Thread(target=self._watch, daemon=True)
        self.thread.start()

    def check(self):
        with self.lock:
            if self.failure:
                raise self.failure

    def send(self, data, channel=None, intensity=None):
        with self.lock:
            if self.failure:
                raise self.failure
            if channel is not None and intensity:
                previous, started = self.active.get(channel, (0, time.monotonic()))
                conservative_intensity = max(previous, intensity)
                enforce_light_limits(channel, conservative_intensity, time.monotonic() - started)
                self.active[channel] = (conservative_intensity, started)
            self.pulser.write(data)
            self.pulser.flush()

    def set_intensity(self, channel, intensity):
        with self.lock:
            if self.failure:
                raise self.failure
            started = self.active[channel][1]
            enforce_light_limits(channel, intensity, time.monotonic() - started)
            self.active[channel] = (intensity, started)

    def off(self, channel):
        with self.lock:
            self.active.pop(channel, None)

    def _watch(self):
        while not self.finished.wait(0.005):
            with self.lock:
                try:
                    now = time.monotonic()
                    for channel, (intensity, started) in self.active.items():
                        enforce_light_limits(channel, intensity, now - started)
                except ValueError as exc:
                    self.failure = exc
                    try:
                        self.pulser.write(b"LED_OFF,0,\n")
                        self.pulser.flush()
                    except (serial.SerialException, OSError) as shutdown_error:
                        self.failure = RuntimeError(f"{exc} Emergency LED shutdown failed: {shutdown_error}")
                    return

    def close(self):
        self.finished.set()
        self.thread.join()


def _pulser_command(guard, command, stopped, channel=None, intensity=None):
    guard.send(command.encode("ascii"), channel, intensity)
    _wait_for(guard.pulser, "Done", stopped)
    guard.check()


def _wait_with_guard(seconds, stopped, guard):
    deadline = time.monotonic() + seconds
    while True:
        if guard:
            guard.check()
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


# Execute a validated protocol on a worker thread. `stopped` is a threading
# Event shared with the UI; `on_measurement` receives instrument time in
# seconds and computed fluorescence after each successful CSV write.
def run_protocol(port, protocol, offset, output_path, stopped, on_measurement, pulser_port=None):
    if not math.isfinite(offset):
        raise ValueError("Offset must be a finite number.")
    # Validate again immediately before opening hardware, including when a
    # caller supplies a protocol directly rather than using load_protocol.
    validate_protocol(protocol)
    if any(step[0] == "A" for step in protocol) and not pulser_port:
        raise ValueError("A pulser serial port is required for external LED commands.")
    if pulser_port and pulser_port.casefold() == port.casefold():
        raise ValueError("Ambit and pulser must use different serial ports.")
    device = None
    pulser = None
    guard = None
    start_requested = False
    primary_error = None
    try:
        if stopped.is_set():
            raise AmbitStopped()
        # Exclusive creation protects existing files. The header is flushed
        # before connecting, so a failed connection can leave a header-only CSV.
        with open(output_path, "x", newline="", encoding="utf-8") as output:
            writer = csv.writer(output)
            writer.writerow(["timestamp_utc", "T_ms", "S", "R", "F", "B",
                             "offset", "fluorescence", "raw_response"])
            output.flush()
            if any(step[0] == "A" for step in protocol):
                pulser = serial.Serial(pulser_port, 115200, timeout=0.05, write_timeout=1,
                                       dsrdtr=True, rtscts=False)
                guard = _LightGuard(pulser)
                _pulser_command(guard, "LED_OFF,0,\n", stopped)
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
            # Waits and sampling intervals use Event.wait so Stop interrupts
            # them. A P step needs no action because the UI plots each reading.
            for step in protocol:
                if stopped.is_set():
                    raise AmbitStopped()
                if guard:
                    guard.check()
                if step[0] == "W":
                    _wait_with_guard(step[1], stopped, guard)
                elif step[0] == "A":
                    channel, intensity = step[1:]
                    hardware_channel = PULSER_CHANNELS[channel]
                    if intensity:
                        _pulser_command(guard, f"DAC,{hardware_channel},{intensity},\n",
                                        stopped, channel, intensity)
                        guard.set_intensity(channel, intensity)
                        _pulser_command(guard, f"LED_ON,{hardware_channel},\n", stopped)
                    else:
                        _pulser_command(guard, f"LED_OFF,{hardware_channel},\n", stopped)
                        guard.off(channel)
                elif step[0] == "M":
                    enforce_light_limits("Ambit", step[3], 0)
                    device.write(bytes([65, step[3]]))
                    device.flush()
                    for _ in range(step[1]):
                        if stopped.is_set():
                            raise AmbitStopped()
                        if guard:
                            guard.check()
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
                                         fluorescence if fluorescence is not None else "", raw])
                        output.flush()
                        # Preserve the raw row even when R=0, then stop rather
                        # than divide by zero or emit a fabricated plot point.
                        if fluorescence is None:
                            raise ValueError("Ambit returned R=0; raw measurement was saved, but fluorescence is undefined.")
                        on_measurement(measurement["T"] / 1000, fluorescence)
                        # Include serial-read time in the interval. If reading
                        # took longer than requested, the next reading starts
                        # without another sleep; precise timing is not assured.
                        remaining = step[2] - (time.monotonic() - started)
                        if remaining > 0:
                            _wait_with_guard(remaining, stopped, guard)
    # Preserve the original failure while attempting every cleanup operation.
    except Exception as exc:
        primary_error = exc
    finally:
        cleanup_errors = []
        if guard is not None:
            guard.close()
            try:
                guard.check()
            except (ValueError, RuntimeError) as exc:
                if primary_error is None or isinstance(primary_error, AmbitStopped):
                    primary_error = exc
                elif primary_error is not exc:
                    cleanup_errors.append(f"light watchdog: {exc}")
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
        if cleanup_errors:
            details = "; ".join(cleanup_errors)
            raise RuntimeError(f"Ambit cleanup failed ({details}). Original error: {primary_error}") from primary_error
    if primary_error is not None:
        raise primary_error
