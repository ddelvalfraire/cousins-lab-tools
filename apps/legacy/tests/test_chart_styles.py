"""Tests for saving chart line colors and widths in Modules 1 and 2."""

import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PyQt5 import QtCore, QtGui, QtWidgets

# Keep PyQt5 imported first: pyqtgraph uses whichever Qt binding is already loaded.
# isort: split
import pyqtgraph as pg
import pytest

from Code.Module_Main_1_3.Application.uiElements.appearance import (
    load_pen,
    save_pen,
)
from Code.Module_Main_1_3.Application.uiElements.graph import Graph

DEFAULT = pg.mkPen(color="#4363d8", width=4)


@pytest.fixture(scope="module")
def app():
    return QtWidgets.QApplication.instance() or QtWidgets.QApplication([])


@pytest.fixture
def settings_dir(app, tmp_path):
    # Graphs save to the user's settings folder; point it at a temporary one.
    QtCore.QSettings.setPath(
        QtCore.QSettings.IniFormat, QtCore.QSettings.UserScope, str(tmp_path)
    )
    return tmp_path


@pytest.fixture
def settings(tmp_path):
    return QtCore.QSettings(str(tmp_path / "styles.ini"), QtCore.QSettings.IniFormat)


def raw_graph(module):
    """A raw masses graph with a Mass 44 line, as a module would build it."""
    graph = Graph(100, 100, module, "raw-masses")
    line = pg.PlotDataItem(pen=DEFAULT)
    graph.addItem(line)
    graph.registerSeries("Mass 44", line, "Mass 44")
    return graph, line


def pen_of(line):
    pen = QtGui.QPen(line.opts["pen"])
    return pen.color().name(), pen.widthF()


def test_saved_pen_loads_with_its_color_and_width(settings):
    pen = QtGui.QPen(DEFAULT)
    pen.setColor(QtGui.QColor("#00ff00"))
    pen.setWidthF(7.5)
    save_pen(settings, "Mass 44", pen, DEFAULT)

    loaded = load_pen(settings, "Mass 44", DEFAULT)

    assert loaded.color().name() == "#00ff00"
    assert loaded.widthF() == 7.5


def test_nothing_saved_loads_nothing(settings):
    assert load_pen(settings, "Mass 44", DEFAULT) is None


def test_saving_the_default_removes_the_saved_pen(settings):
    pen = QtGui.QPen(DEFAULT)
    pen.setWidthF(9)
    save_pen(settings, "Mass 44", pen, DEFAULT)

    save_pen(settings, "Mass 44", QtGui.QPen(DEFAULT), DEFAULT)

    assert settings.childGroups() == []
    assert load_pen(settings, "Mass 44", DEFAULT) is None


@pytest.mark.parametrize(
    ("color", "width"),
    [("not a color", 4), ("#00ff00", "wide"), ("#00ff00", 21), ("#00ff00", -1)],
)
def test_invalid_saved_values_are_ignored(settings, color, width):
    settings.setValue("Mass 44/color", color)
    settings.setValue("Mass 44/width", width)

    assert load_pen(settings, "Mass 44", DEFAULT) is None


def test_chosen_style_is_restored_after_restart(settings_dir):
    graph, _ = raw_graph("module1")
    pen = QtGui.QPen(DEFAULT)
    pen.setColor(QtGui.QColor("#00ff00"))
    pen.setWidthF(9)
    graph.appearance.apply("Mass 44", pen)

    _, restarted = raw_graph("module1")

    assert pen_of(restarted) == ("#00ff00", 9.0)
    assert (settings_dir / "CousinsLab" / "module1.ini").exists()


def test_module_1_style_does_not_change_module_2(settings_dir):
    graph, _ = raw_graph("module1")
    pen = QtGui.QPen(DEFAULT)
    pen.setColor(QtGui.QColor("#00ff00"))
    graph.appearance.apply("Mass 44", pen)

    _, module2_line = raw_graph("module2")

    assert pen_of(module2_line) == ("#4363d8", 4.0)


def test_graph_without_a_module_saves_nothing(settings_dir):
    graph = Graph(100, 100)
    line = pg.PlotDataItem(pen=DEFAULT)
    graph.addItem(line)
    graph.registerSeries("Mass 44", line, "Mass 44")
    pen = QtGui.QPen(DEFAULT)
    pen.setWidthF(9)

    graph.appearance.apply("Mass 44", pen)

    assert pen_of(line) == ("#4363d8", 9.0)
    assert list(settings_dir.iterdir()) == []
