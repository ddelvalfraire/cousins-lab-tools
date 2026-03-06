from PyQt5 import QtCore
import numpy as np
from sympy import lambdify
import math
import random

from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations

class SamplePlotCalcWorker(QtCore.QObject):
    # Singles for the main module
    finished = QtCore.pyqtSignal()
    error = QtCore.pyqtSignal(str)
    userWarning = QtCore.pyqtSignal(str)

    resultReady = QtCore.pyqtSignal(dict)

    def __init__(self, data, xexp, yexp, lineOfBestFit, getVars, temp, deltaPart):
        super().__init__()
        self.data = data
        self.xexp = xexp
        self.yexp = yexp
        self.lineOfBestFit = lineOfBestFit
        self.getVars = getVars
        self.temp = temp
        self.deltaPart = deltaPart

        self.xsymbols = sorted(list(xexp.free_symbols), key=lambda s: s.name)
        self.ysymbols = sorted(list(yexp.free_symbols), key=lambda s: s.name)

        self._x_eval = lambdify(self.xsymbols, xexp, "numpy")
        self._y_eval = lambdify(self.ysymbols, yexp, "numpy")

    def extractArgs(self, vars, symbols):
        missing = []
        bad = []
        args = []

        for sym in symbols:
            name = str(sym)
            if name not in vars:
                missing.append(name)
                continue
            val = vars[name]
            try:
                f = float(val)
                if not np.isfinite(f):
                    bad.append(name)
                else:
                    args.append(f)
            except Exception:
                bad.append(name)
        if missing:
            return False, f"The following variables are not valid: {missing}"
        if bad:
            if len(bad) == 1:
                return False, f"The following variable has no value: {bad[0]}"
            return False, f"Some variables have no value: {bad}"
        return True, args

    def savgol_coeffs(self, window_length, polyorder, deriv=0, delta=1.0):
        half = window_length // 2
        # positions: -half .. +half
        x = np.arange(-half, half + 1)
        A = np.vstack([x ** i for i in range(polyorder + 1)]).T

        # Compute the pseudo-inverse
        ATA_inv = np.linalg.pinv(A)

        # derivative row
        coeffs = ATA_inv[deriv] * math.factorial(deriv) / (delta ** deriv)

        return coeffs

    def savgol_filter_np(self, y, window_length, polyorder, mode='interp'):
        coeffs = self.savgol_coeffs(window_length, polyorder, deriv=0)
        half = window_length // 2

        # pad
        if mode == 'interp':
            # mirror padding (closest to SciPy’s 'interp')
            ypad = np.pad(y, (half, half), mode='reflect')
        else:
            raise ValueError("only mode='interp' implemented")

        return np.convolve(ypad, coeffs[::-1], mode='valid')

    @QtCore.pyqtSlot()
    def run(self):
        try:
            # sampleEquationPlot is the data that get put on the graph
            sampleEquationPlotX = []
            sampleEquationPlotY = []

            # smaple is for the data that get put in the table, it should be the same as sampleEquationPlot expect it includes errors
            sampleX = []
            sampleY = []
            warnedOnce = False

            # Process each record
            for d in self.data:
                v = self.getVars(d)
                if not v:
                    sampleX.append(None)
                    sampleY.append(None)
                    if not warnedOnce:
                        warnedOnce = True
                    continue

                okx, xmsg = self.extractArgs(v, self.xsymbols)
                oky, ymsg = self.extractArgs(v, self.ysymbols)

                # Test if the expression is valid and all vars have values
                if not okx or not oky:
                    sampleX.append(None)
                    sampleY.append(None)
                    if not warnedOnce:
                        warnedOnce = True
                        ymsg = xmsg if not okx else ymsg

                        if ymsg != "The following variable has no value: CO2Zero44":
                            self.userWarning.emit(ymsg)
                    continue

                # trys to evaluate the expression
                try:
                    xVal = float(self._x_eval(*xmsg))
                    yVal = float(self._y_eval(*ymsg))
                except Exception as ex:
                    sampleX.append(self._x_eval(*xmsg))
                    sampleY.append(self._y_eval(*ymsg))
                    if not warnedOnce:
                        warnedOnce = True
                        self.userWarning.emit(f"Could not evaluate equation for a row: {ex}")
                    continue

                #  add data to list
                sampleX.append(xVal)
                sampleY.append(yVal)
                if np.isfinite(xVal) and np.isfinite(yVal):
                    sampleEquationPlotX.append(xVal)
                    sampleEquationPlotY.append(yVal)
                else:
                    if not warnedOnce:
                        warnedOnce = True

            # Line of best fit
            lbfX, lbfY = self.lineOfBestFit(sampleEquationPlotX, sampleEquationPlotY)

            # time vs d²/dt²(Mass44)
            times = []
            m44 = []
            for d in self.data:
                v = self.getVars(d)
                if v is None:
                    continue
                if "Time" in v and "Mass44" in v:
                    times.append(v["Time"])
                    m44.append(v["Mass44"])

            # Helper calculations
            times = np.asarray(times, dtype=float)
            m44 = np.asarray(m44, dtype=float)
            mask = np.isfinite(times) & np.isfinite(m44)
            times, m44 = times[mask], m44[mask]

            d2_m44 = None
            d2_Time = times
            if times.size >= 5:
                # smooth data
                window = min(51, len(m44) - 1)
                if window % 2 == 0:
                    window -= 1


                m44_smooth = self.savgol_filter_np(m44, window, 3)

                # d1 = np.gradient(m44_smooth, times, edge_order=2)
                d2_m44 = np.gradient(m44, times, edge_order=2)

            slope, intercept = Calculations.getLineOfBestFit(sampleEquationPlotX, sampleEquationPlotY)
            slope44, _ = Calculations.getLineOfBestFit([t[0] for t in self.data], [t[1][3] for t in self.data])

            #################### Adds Alpha/Delta/Rubisco metrics ####################
            # Compute alpha_total (slope) and delta_total from the equation data already used above.
            # Reuse 'slope' from the Line Of Best Fit section, and read Δ_part from the Calculations tab input.
            try:
                try:
                    alpha_total = float(slope)
                except Exception:
                    # Fallback: recompute from current plot data if needed
                    x_vals = sampleEquationPlotX
                    y_vals = sampleEquationPlotY
                    try:
                        alpha_total, _ = Calculations.getLineOfBestFit(x_vals, y_vals)
                    except Exception:
                        alpha_total = None

                delta_part_val = float(self.deltaPart)

                if alpha_total is not None:
                    delta_total = alpha_total - 1.0
                    try:
                        delta_rubisco = (1.0 + delta_total) / (1.0 + delta_part_val) - 1.0
                    except Exception:
                        delta_rubisco = None
                else:
                    delta_rubisco = None
            except:
                delta_rubisco = None
                alpha_total = None
            try:
                rSquared = Calculations.rSquared(sampleX, sampleY)
            except:
                rSquared = "null"

            self.resultReady.emit({
                "sampleEquationPlotX": sampleEquationPlotX,
                "sampleEquationPlotY": sampleEquationPlotY,
                "sampleX": sampleX,
                "sampleY": sampleY,
                "lbfX": lbfX,
                "lbfY": lbfY,
                "times": times if times.size > 0 else None,
                "d2_m44": d2_m44,
                "d2_Time": d2_Time,
                "delta": delta_rubisco,
                "rSquared": rSquared,
                "α_total (slope)": alpha_total,
                "delta_rubisco": delta_rubisco,
                "slope44": slope44
            })
        except Exception as e:
            self.error.emit(str(e))
        finally:
            self.finished.emit()

