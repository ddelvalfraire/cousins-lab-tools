
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

from statistics import mean

class Calculations:


    @staticmethod
    def getMean(dataPoints, xleft, xright, graph):
        """
            Returns mean from a one data stream 
            based on the left and right x values
            :param {dataPoints : dict} -> dictionary of data points
            :param {xleft: Float} -> left x value from mean bars
            :param {xright: Float} -> right x value from mean bars
            :param {graph_num: int} -> index of the graph we're getting the mean from
            :return -> mean value
        """
        
        i = 0
        y_values = []
        keys = list(dataPoints.keys())

        # append all the y values in the desired graph_num from xleft to xright
        while (keys[i] <= xright):
            if keys[i] < xleft:
                i+=1
                continue
            else:
                y_values.append(dataPoints[keys[i]][graph])
                i+=1
                
        # return mean of all the y values
        return round(mean(y_values), 4)



    @staticmethod
    def calculate02Calibration(mean_value, temp):
        """
        Calculates the temperature dependent solubility.
        Then uses the mean mV value for water equilibrated with air and
        the temp solubility to calculated the O2 calibration.
        """

        # Calculate temperature dependent solubility
        tempSolubility = (-0.0018 * (temp ** 3)) + (0.2229 * (temp ** 2)) - (12.387 * temp) + 456.49

        # Calculate O2 calibration
        o2Calibration = tempSolubility / mean_value

        return o2Calibration

    @staticmethod
    def calculateSlope(dataPoints):
        """
        Calculates and returns the slope of the set of data points.
        """

        voltages = list(dataPoints.values())
        concentrations = list(dataPoints.keys())

        # only calculate the slope if there is more than one point in the data set
        if len(dataPoints) > 1:
            if (voltages[-1] == voltages[0]):
                return None
            else:
                return (concentrations[-1] - concentrations[0]) / (voltages[-1] - voltages[0])

        else:
            return 0


    
    def calculateIntercept(dataPoints, slope):
        """
        Calculates and returns the y-intercept of a line (given more than one point)
        """

        if len(dataPoints) > 1:
            voltages = list(dataPoints.keys())
            concentrations = list(dataPoints.values())
            
            return concentrations[0] - (slope * voltages[0])
        else:
            return 0
            
