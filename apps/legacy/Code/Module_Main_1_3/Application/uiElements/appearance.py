from dataclasses import dataclass, field

from PyQt5 import QtCore, QtGui, QtWidgets

# Keep PyQt5 imported first: pyqtgraph uses whichever Qt binding is already loaded.
# isort: split
import pyqtgraph as pg


@dataclass
class SeriesStyle:
    name: str
    kind: str
    default_pen: QtGui.QPen
    default_brush: QtGui.QBrush = None
    pen: QtGui.QPen = None
    items: list = field(default_factory=list)
    color_changed: object = None


MAX_WIDTH = 20


def load_pen(settings, key, default_pen):
    """Return the saved pen for a series, or None if none is saved or it is invalid."""
    color_name = settings.value(key + "/color")
    if not isinstance(color_name, str):
        return None
    color = QtGui.QColor(color_name)
    try:
        width = float(settings.value(key + "/width"))
    except (TypeError, ValueError, OverflowError):
        return None
    if not color.isValid() or not 0 <= width <= MAX_WIDTH:
        return None
    pen = QtGui.QPen(default_pen)
    pen.setColor(color)
    pen.setWidthF(width)
    return pen


def save_pen(settings, key, pen, default_pen):
    """Save a series pen. Saving the default pen removes the saved values."""
    if pen == default_pen:
        settings.remove(key)
    else:
        settings.setValue(key + "/color", pen.color().name(QtGui.QColor.HexArgb))
        settings.setValue(key + "/width", pen.widthF())
    settings.sync()


class AppearanceRegistry:
    """Tracks the series on one graph and the pen the user chose for each.

    With a module name, the chosen pens are saved in that module's own
    settings file, so Module 1 and Module 2 keep separate preferences.
    """

    def __init__(self, graph, module=None, chart_key=None):
        self.graph = graph
        self.series = {}
        self.dialog = None
        self.settings = None
        if module is not None:
            self.settings = QtCore.QSettings(
                QtCore.QSettings.IniFormat,
                QtCore.QSettings.UserScope,
                "CousinsLab",
                module,
            )
            self.settings.setFallbacksEnabled(False)
            self.settings.beginGroup("chart-appearance/" + chart_key)

    def register(self, key, item, name, kind="line", color_changed=None):
        if key not in self.series:
            if kind == "scatter":
                pen = item.opts["symbolPen"]
                brush = pg.mkBrush(item.opts["symbolBrush"])
            elif kind == "boundary":
                pen, brush = item.pen, None
            else:
                pen, brush = item.opts["pen"], None
            self.series[key] = SeriesStyle(
                name,
                kind,
                QtGui.QPen(pg.mkPen(pen)),
                brush,
                color_changed=color_changed,
            )
            if self.settings is not None:
                self.series[key].pen = load_pen(
                    self.settings, key, self.series[key].default_pen
                )
        entry = self.series[key]
        if color_changed is not None:
            entry.color_changed = color_changed
        if item not in entry.items:
            entry.items.append(item)
        if kind == "line":
            item.curve.setClickable(True, width=12)
        if entry.pen is not None:
            self.apply(key, entry.pen, persist=False)

    def clear_items(self):
        for entry in self.series.values():
            entry.items.clear()

    def apply(self, key, pen, persist=True):
        entry = self.series[key]
        entry.pen = QtGui.QPen(pen)
        for item in entry.items:
            if entry.kind == "scatter":
                item.setSymbolPen(pen)
                if pen == entry.default_pen:
                    brush = entry.default_brush
                else:
                    brush = pg.mkBrush(pen.color())
                item.setSymbolBrush(brush)
            else:
                item.setPen(pen)
        if entry.color_changed:
            entry.color_changed(pen.color())
        if persist and self.settings is not None:
            save_pen(self.settings, key, pen, entry.default_pen)

    def hits(self, scene_pos):
        """Return the keys of the series drawn under scene_pos."""
        view = self.graph.plotItem.getViewBox()
        if not view.sceneBoundingRect().contains(scene_pos):
            return []
        transform = self.graph.viewportTransform()
        point = transform.map(scene_pos)
        hits = []
        for key, entry in self.series.items():
            for item in entry.items:
                if not item.isVisible() or item.scene() is None:
                    continue
                if entry.kind == "scatter":
                    local = item.scatter.mapFromScene(scene_pos)
                    hit = bool(len(item.scatter.pointsAt(local)))
                else:
                    if entry.kind == "line":
                        source, path = item.curve, item.curve.getPath()
                    else:
                        source, path = item, item.shape()
                    path = source.deviceTransform(transform).map(path)
                    stroker = QtGui.QPainterPathStroker()
                    current = entry.pen or entry.default_pen
                    stroker.setWidth(max(12, current.widthF() + 6))
                    hit = stroker.createStroke(path).contains(point)
                    if entry.kind == "boundary":
                        hit = hit or path.contains(point)
                if hit:
                    hits.append(key)
                    break
        return hits

    def edit(self, keys):
        if self.dialog is not None:
            self.dialog.raise_()
            self.dialog.activateWindow()
            return
        self.dialog = AppearanceDialog(self, keys)
        self.dialog.finished.connect(self._closed)
        self.dialog.show()

    def _closed(self, result):
        self.dialog.deleteLater()
        self.dialog = None


class AppearanceDialog(QtWidgets.QDialog):
    """Lets the user pick a color and width for a series on a graph."""

    def __init__(self, registry, keys):
        super().__init__(registry.graph.window())
        self.registry = registry
        self.keys = keys
        self.setWindowTitle("Series appearance")
        self.setWindowModality(QtCore.Qt.NonModal)
        self.color_dialog = None
        layout = QtWidgets.QVBoxLayout(self)
        title = registry.graph.accessibleName() or "Chart"
        layout.addWidget(QtWidgets.QLabel(title))
        if len(keys) > 1:
            layout.addWidget(
                QtWidgets.QLabel("Several series overlap. Choose the intended series.")
            )
        self.target = QtWidgets.QComboBox()
        for key in keys:
            self.target.addItem(registry.series[key].name, key)
        layout.addWidget(self.target)
        self.color_button = QtWidgets.QPushButton("Choose color")
        layout.addWidget(self.color_button)
        self.width = QtWidgets.QDoubleSpinBox()
        self.width.setRange(0, MAX_WIDTH)
        self.width.setSingleStep(0.5)
        self.width.setSuffix(" px")
        self.width_label = QtWidgets.QLabel()
        layout.addWidget(self.width_label)
        layout.addWidget(self.width)
        self.preview = pg.PlotWidget()
        self.preview.setFixedHeight(90)
        self.preview.hideAxis("left")
        self.preview.hideAxis("bottom")
        self.preview.setMouseEnabled(False, False)
        layout.addWidget(self.preview)
        defaults = QtWidgets.QPushButton("Restore default")
        layout.addWidget(defaults)
        buttons = QtWidgets.QDialogButtonBox(
            QtWidgets.QDialogButtonBox.Ok | QtWidgets.QDialogButtonBox.Cancel
        )
        layout.addWidget(buttons)
        self.target.currentIndexChanged.connect(self.load_target)
        self.color_button.clicked.connect(self.choose_color)
        self.width.valueChanged.connect(self.update_preview)
        defaults.clicked.connect(self.restore_default)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        self.load_target()

    @property
    def key(self):
        return self.target.currentData()

    def load_target(self):
        entry = self.registry.series[self.key]
        self.pending = QtGui.QPen(entry.pen or entry.default_pen)
        if entry.kind == "scatter":
            self.width_label.setText("Marker outline width")
        else:
            self.width_label.setText("Line width")
        self.width.setValue(self.pending.widthF())
        self.update_preview()

    def update_preview(self):
        self.pending.setWidthF(self.width.value())
        color = self.pending.color()
        foreground = "black" if color.lightnessF() > 0.5 else "white"
        self.color_button.setStyleSheet(
            "background-color: " + color.name() + "; color: " + foreground
        )
        self.preview.clear()
        if self.registry.series[self.key].kind == "scatter":
            self.preview.plot(
                [0, 1, 2],
                [0, 1, 0],
                pen=None,
                symbol="o",
                symbolPen=self.pending,
                symbolBrush=color,
            )
        else:
            self.preview.plot([0, 1, 2], [0, 1, 0], pen=self.pending)

    def choose_color(self):
        if self.color_dialog is not None:
            self.color_dialog.raise_()
            return
        self.color_dialog = QtWidgets.QColorDialog(self.pending.color(), self)
        self.color_dialog.setOption(QtWidgets.QColorDialog.DontUseNativeDialog)
        self.color_dialog.colorSelected.connect(self.set_color)
        self.color_dialog.finished.connect(self.close_color)
        self.color_dialog.open()

    def set_color(self, color):
        self.pending.setColor(color)
        self.update_preview()

    def close_color(self, result):
        self.color_dialog.deleteLater()
        self.color_dialog = None

    def restore_default(self):
        self.pending = QtGui.QPen(self.registry.series[self.key].default_pen)
        self.width.setValue(self.pending.widthF())
        self.update_preview()

    def accept(self):
        self.registry.apply(self.key, self.pending)
        super().accept()
