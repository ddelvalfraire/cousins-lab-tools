from PyQt5 import QtCore
import numpy as np
from sympy import lambdify

from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations

class SamplePlotCalcWorker(QtCore.QObject):
    # Singles for the main module
    finished = QtCore.pyqtSignal()
    error = QtCore.pyqtSignal(str)
    userWarning = QtCore.pyqtSignal(str)

    resultReady = QtCore.pyqtSignal(dict)

    def __init__(self, data, xexp, yexp, lineOfBestFit, getVars, temp):
        super().__init__()
        self.data = data
        self.xexp = xexp
        self.yexp = yexp
        self.lineOfBestFit = lineOfBestFit
        self.getVars = getVars
        self.temp = temp

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
        try:
            equationX = []
            equationY = []
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

                if not okx or not oky:
                    sampleX.append(None)
                    sampleY.append(None)
                    if not warnedOnce:
                        warnedOnce = True
                        ymsg = xmsg if not okx else ymsg
                        self.userWarning.emit(ymsg)
                    continue

                try:
                    with np.errstate(divide='ignore', invalid='ignore', over='ignore', under='ignore'):
                        xVal = float(self._x_eval(*xmsg))
                        yVal = float(self._y_eval(*ymsg))
                except Exception as ex:
                    sampleX.append(None)
                    sampleY.append(None)
                    if not warnedOnce:
                        warnedOnce = True
                        self.userWarning.emit(f"Could not evaluate equation for a row: {ex}")
                    continue

                sampleX.append(xVal)
                sampleY.append(yVal)
                if np.isfinite(xVal) and np.isfinite(yVal):
                    equationX.append(xVal)
                    equationY.append(yVal)
                else:
                    if not warnedOnce:
                        warnedOnce = True

            # Line of best fit
            lbfX, lbfY = self.lineOfBestFit(equationX, equationY)

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

            times = np.asarray(times, dtype=float)
            m44 = np.asarray(m44, dtype=float)
            mask = np.isfinite(times) & np.isfinite(m44)
            times, m44 = times[mask], m44[mask]

            d2_m44 = None
            if times.size >= 3:
                d1_m44 = np.gradient(m44, times, edge_order=2)
                d2_m44 = np.gradient(d1_m44, times, edge_order=2)

            delta = self.calculateDeltaVal()

            rSquared = Calculations.rSquared(sampleX, sampleY)
            self.resultReady.emit({
                "equationX": equationX,
                "equationY": equationY,
                "sampleX": sampleX,
                "sampleY": sampleY,
                "lbfX": lbfX,
                "lbfY": lbfY,
                "times": times if times.size > 0 else None,
                "d2_m44": d2_m44,
                "delta": delta,
                "rSquared": rSquared
            })
        except Exception as e:
            self.error.emit(str(e))
        finally:
            self.finished.emit()

    def calculateDeltaVal(self):
        try:
            temp = float(self.temp)
        except:
            return None
        print(temp)
        return temp * 100