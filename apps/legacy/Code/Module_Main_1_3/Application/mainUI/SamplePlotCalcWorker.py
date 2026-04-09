from PyQt5 import QtCore
import numpy as np
from sympy import lambdify
import math
import random

from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations

import logging
logger = logging.getLogger(__name__)

class SamplePlotCalcWorker(QtCore.QObject):
    # Singles for the main module
    finished = QtCore.pyqtSignal()
    error = QtCore.pyqtSignal(str)
    userWarning = QtCore.pyqtSignal(str)

    resultReady = QtCore.pyqtSignal(dict)

    def __init__(self, data, pre_extracted, xexp, yexp, lineOfBestFit, temp, deltaPart):
        super().__init__()
        self.data = data
        self.pre_extracted = pre_extracted
        self.xexp = xexp
        self.yexp = yexp
        self.lineOfBestFit = lineOfBestFit
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

    @QtCore.pyqtSlot()
    def run(self):
        logger.debug(f"SamplePlotCalcWorker.run - START (Points: {len(self.data) if self.data else 0})")
        try:
            sampleEquationPlotX = []
            sampleEquationPlotY = []
            sampleX = []
            sampleY = []
            warnedOnce = False

            logger.debug("Processing records for custom plot")
            for i, d in enumerate(self.data if self.data else []):
                v = self.pre_extracted[i]  # ✅ plain dict, no Qt access
                if not v:
                    sampleX.append(None)
                    sampleY.append(None)
                    continue

                okx, xmsg = self.extractArgs(v, self.xsymbols)
                oky, ymsg = self.extractArgs(v, self.ysymbols)

                if not okx or not oky:
                    sampleX.append(None)
                    sampleY.append(None)
                    if not warnedOnce:
                        warnedOnce = True
                        ymsg = xmsg if not okx else ymsg
                        if ymsg != "The following variable has no value: CO2Zero44":
                            self.userWarning.emit(ymsg)
                    continue

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

                sampleX.append(xVal)
                sampleY.append(yVal)
                if np.isfinite(xVal) and np.isfinite(yVal):
                    sampleEquationPlotX.append(xVal)
                    sampleEquationPlotY.append(yVal)

            logger.debug(f"Processed {len(sampleEquationPlotX)} valid points for plotting")

            if len(sampleEquationPlotX) >= 2:
                logger.debug("Calculating line of best fit")
                lbfX, lbfY = self.lineOfBestFit(sampleEquationPlotX, sampleEquationPlotY)
            else:
                logger.debug("Not enough points for line of best fit")
                lbfX, lbfY = [], []

            logger.debug("Processing Mass44 for derivatives")
            times = []
            m44 = []
            for i, d in enumerate(self.data if self.data else []):
                v = self.pre_extracted[i]  # ✅ plain dict
                if v is None:
                    continue
                if "Time" in v and "Mass44" in v:
                    times.append(v["Time"])
                    m44.append(v["Mass44"])

            d2_m44 = None
            d1 = None

            times_smooth = Calculations.adverageDown(times, 8)
            m44_smooth = Calculations.adverageDown(m44, 8)
            times_smooth = np.asarray(times_smooth, dtype=float)
            m44_smooth = np.asarray(m44_smooth, dtype=float)

            d2_Time = times

            if times_smooth.size >= 5:
                logger.debug("Calculating gradients")
                d1 = np.gradient(m44_smooth, times_smooth, edge_order=2)
                d2_m44 = np.gradient(d1, times_smooth, edge_order=2)

            logger.debug("Calculating segment linearity and slope metrics")
            m44dif = Calculations.segment_linearity(m44, times, 0, len(times) - 1)
            m44dif = np.asarray(m44dif, dtype=float)
            times = np.asarray(times, dtype=float)

            slope, intercept = Calculations.getLineOfBestFit(sampleEquationPlotX, sampleEquationPlotY)
            slope44, _ = Calculations.getLineOfBestFit(
                [t[0] for t in (self.data if self.data else [])],
                [t[1][3] for t in (self.data if self.data else [])]
            )

            logger.debug("Calculating Alpha/Delta/Rubisco metrics")
            try:
                try:
                    alpha_total = float(slope)
                except Exception:
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

            logger.debug("Worker emitting results")
            self.resultReady.emit({
                "sampleEquationPlotX": sampleEquationPlotX,
                "sampleEquationPlotY": sampleEquationPlotY,
                "sampleX": sampleX,
                "sampleY": sampleY,
                "lbfX": lbfX,
                "lbfY": lbfY,
                "times_smooth": times_smooth if times_smooth.size > 0 else None,
                "d2_m44": d2_m44,
                "d2_Time": d2_Time,
                "d1_m44": d1,
                "times": times if times.size > 0 else None,
                "difference": m44dif,
                "delta": delta_rubisco,
                "rSquared": rSquared,
                "α_total (slope)": alpha_total,
                "delta_rubisco": delta_rubisco,
                "slope44": slope44
            })
            logger.debug("SamplePlotCalcWorker.run - END")
        except Exception as e:
            logger.error(f"SamplePlotCalcWorker.run - ERROR: {e}")
            self.error.emit(str(e))
        finally:
            self.finished.emit()

