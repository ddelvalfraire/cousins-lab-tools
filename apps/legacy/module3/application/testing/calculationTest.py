
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import unittest
import sys

sys.path.append('../calculations')

from Calculations import Calculations

import unittest

class TestCalculate02Calibration(unittest.TestCase):

    def test_calculate02Calibration(self):
        # Test case 1: Check output for normal input
        mean_value = 5.5
        temp = 25

        expected_output = ((-0.0018 * (temp ** 3)) + (0.2229 * (temp ** 2)) - (12.387 * temp) + 456.49) / mean_value
        self.assertAlmostEqual(Calculations.calculate02Calibration(mean_value, temp), expected_output)

        # Test case 2: Check output for low temperature
        mean_value = 6.2
        temp = -10

        expected_output = ((-0.0018 * (temp ** 3)) + (0.2229 * (temp ** 2)) - (12.387 * temp) + 456.49) / mean_value
        self.assertAlmostEqual(Calculations.calculate02Calibration(mean_value, temp), expected_output)

        # Test case 3: Check output for high temperature
        mean_value = 6.8
        temp = 50

        expected_output = ((-0.0018 * (temp ** 3)) + (0.2229 * (temp ** 2)) - (12.387 * temp) + 456.49) / mean_value
        self.assertAlmostEqual(Calculations.calculate02Calibration(mean_value, temp), expected_output)

    def test_calculateSlope(self):

        # Test case 1: empty dataPoints dictionary
        dataPoints = {}
        expected_output = 0
        self.assertEqual(Calculations.calculateSlope(dataPoints), expected_output)

        # Test case 2: dataPoints dictionary with only one point
        dataPoints = {1: 2}
        expected_output = 0
        self.assertEqual(Calculations.calculateSlope(dataPoints), expected_output)

        # Test case 3: dataPoints dictionary with two points, same voltage
        dataPoints = {1: 2, 2: 2}
        expected_output = None
        self.assertEqual(Calculations.calculateSlope(dataPoints), expected_output)

        # Test case 4: dataPoints dictionary with two points, different voltage
        dataPoints = {1: 2, 2: 3}
        expected_output = 1
        self.assertEqual(Calculations.calculateSlope(dataPoints), expected_output)

        # Test case 5: dataPoints dictionary with more than two points, same voltage
        dataPoints = {1: 2, 2: 2, 3: 2}
        expected_output = None
        self.assertEqual(Calculations.calculateSlope(dataPoints), expected_output)

        # Test case 6: dataPoints dictionary with more than two points, different voltage
        dataPoints = {1: 2, 2: 3, 3: 4}
        expected_output = 1
        self.assertEqual(Calculations.calculateSlope(dataPoints), expected_output)

        # Test case 1: Test with valid data points and slope
    def test_calculateIntercept_valid(self):
        dataPoints = {1: 2, 3: 4}
        slope = 1
        assert Calculations.calculateIntercept(dataPoints, slope) == 1

    # Test case 2: Test with single data point
    def test_calculateIntercept_singlePoint(self):
        dataPoints = {1: 2}
        slope = 1
        assert Calculations.calculateIntercept(dataPoints, slope) == 0

    # Test case 3: Test with empty data points
    def test_calculateIntercept_emptyDataPoints(self):
        dataPoints = {}
        slope = 1
        assert Calculations.calculateIntercept(dataPoints, slope) == 0

if __name__ == '__main__':
    unittest.main()
