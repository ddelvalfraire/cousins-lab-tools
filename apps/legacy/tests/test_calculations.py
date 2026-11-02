"""Tests for the calculations shared by Module 1 and Module 2."""

import pytest

from Code.Module_Main_1_3.Application.calculations.Calculations import Calculations

# O2 solubility at 25 °C from the lab's cubic fit:
# -0.0018*25**3 + 0.2229*25**2 - 12.387*25 + 456.49
O2_AIR_AT_25 = 258.0025


def test_o2_air_at_25_degrees():
    assert Calculations.calculateO2Air(25) == pytest.approx(O2_AIR_AT_25)


def test_o2_air_at_0_degrees_is_the_constant_term():
    assert Calculations.calculateO2Air(0) == pytest.approx(456.49)


def test_o2_calibration_divides_solubility_by_the_mean_reading():
    assert Calculations.calculate02Calibration(2.5, 25) == pytest.approx(103.201)
    assert Calculations.calculateO2Cal(O2_AIR_AT_25, 2.5) == pytest.approx(103.201)


def test_ubar_o2():
    assert Calculations.calculateUbarO2(103.201, 2.0) == pytest.approx(206.402)


def test_slope_of_a_co2_calibration():
    # {concentration: mean mV}
    cal = {0: 1.5, 1000: 2.75, 2000: 4.0, 3000: 5.5}
    assert Calculations.calculateSlope(cal) == pytest.approx(750.0)


@pytest.mark.parametrize("cal", [{}, {0: 1.5}])
def test_slope_needs_two_points(cal):
    assert Calculations.calculateSlope(cal) == 0


def test_slope_is_undefined_when_readings_do_not_change():
    assert Calculations.calculateSlope({0: 1.5, 1000: 1.5}) is None


def test_intercept_of_a_co2_calibration():
    cal = {0: 1.5, 1000: 2.75, 2000: 4.0, 3000: 5.5}
    assert Calculations.calculateIntercept(cal, 750.0) == pytest.approx(1.5)


def test_intercept_needs_two_points():
    assert Calculations.calculateIntercept({0: 1.5}, 750.0) == 0


def test_co2_per_millivolt_averages_the_three_steps():
    # Steps of 1, 2 and 3 mV: (1/28) * (1/1 + 1/2 + 1/3) / 3
    expected = 11 / 504
    assert Calculations.calculateCo2OverVolt(0, 1, 3, 6) == pytest.approx(expected)


def test_co2_per_millivolt_is_undefined_for_a_flat_step():
    assert Calculations.calculateCo2OverVolt(0, 1, 1, 2) == -99999


def test_percent_and_ubar_co2():
    percent = Calculations.calculatePercentCO2(0.02, 5.0, 1.0)
    assert percent == pytest.approx(0.08)
    assert Calculations.calculateUbarCO2(percent) == pytest.approx(736.0)


def test_atom_percent_49():
    # Masses 32, 34, 36, 44, 45, 46, 47, 49
    readings = [9, 9, 9, 9, 2, 9, 3, 5]
    assert Calculations.calculateAtom49(readings) == pytest.approx(50.0)


def test_atom_percent_49_treats_negative_readings_as_zero():
    readings = [0, 0, 0, 0, -1, 0, 3, 1]
    assert Calculations.calculateAtom49(readings) == pytest.approx(25.0)


def test_mean_between_the_mean_bars():
    # {time: [reading for each mass]}
    data = {0.0: [1.0, 10.0], 1.0: [2.0, 20.0], 2.0: [3.0, 30.0], 3.0: [4.0, 40.0]}
    assert Calculations.getMean(data, 1.0, 2.0, 0) == 2.5
    assert Calculations.getMean(data, 1.0, 2.0, 1) == 25.0


def test_mean_rounds_to_four_places():
    data = {0.0: [1.0], 1.0: [2.0], 2.0: [2.0], 3.0: [9.0]}
    assert Calculations.getMean(data, 0.0, 2.0, 0) == 1.6667


def test_line_of_best_fit():
    slope, intercept = Calculations.getLineOfBestFit([0, 1, 2, 3], [1, 3, 5, 7])
    assert slope == pytest.approx(2.0)
    assert intercept == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("x", "y"),
    [([], []), ([1.0], [2.0]), ([1.0, 1.0], [2.0, 3.0]), (["a", "b"], [1, 2])],
    ids=["empty", "single point", "same x", "not numbers"],
)
def test_line_of_best_fit_is_undefined(x, y):
    assert Calculations.getLineOfBestFit(x, y) == (None, None)


def test_r_squared_of_a_perfect_line():
    assert Calculations.rSquared([0, 1, 2, 3], [1, 3, 5, 7]) == pytest.approx(1.0)


def test_r_squared_of_scattered_points():
    # Fit y = 1.1x + 1.1: residual sum 2.7, total sum 8.75
    r2 = Calculations.rSquared([0, 1, 2, 3], [1, 3, 2, 5])
    assert r2 == pytest.approx(1 - 2.7 / 8.75)


def test_r_squared_is_null_for_bad_input():
    assert Calculations.rSquared([], []) == "null"


def test_segment_linearity_is_zero_on_a_straight_line():
    deviation = Calculations.segment_linearity([1, 3, 5, 7, 100], [0, 1, 2, 3, 4], 0, 3)
    assert deviation == pytest.approx([0.0, 0.0, 0.0, 0.0])


def test_segment_linearity_measures_distance_from_the_fit():
    # Fit through (0,0), (1,1), (2,0) is y = 1/3, so deviations are -1/3, 2/3, -1/3
    deviation = Calculations.segment_linearity([0, 1, 0], [0, 1, 2], 0, 2)
    assert deviation == pytest.approx([-1 / 3, 2 / 3, -1 / 3])


def test_average_down():
    assert Calculations.adverageDown([1, 2, 3, 4, 5], 2) == [1.5, 3.5, 5.0]


def test_average_down_of_nothing():
    assert Calculations.adverageDown([], 3) == []


def test_round_if_float():
    assert Calculations.roundIfFloat(1.23456, 2) == 1.23
    assert Calculations.roundIfFloat([1.23456, "label", 2], 2) == [1.23, "label", 2]
    assert Calculations.roundIfFloat("label", 2) == "label"
