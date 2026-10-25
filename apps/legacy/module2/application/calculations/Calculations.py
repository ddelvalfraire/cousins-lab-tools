
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
        
    def calculateCo2OverVolt(calZero, cal1, cal2, cal3):
        """to be called once cals are completed 
        Calculates the average %CO2/mv for all CO2 cal
        """
        mvdiff1 = cal1 - calZero
        mvdiff2 = cal2 - cal1
        mvdiff3 = cal3 - cal2
        if(mvdiff1 == 0 or mvdiff2 == 0 or mvdiff3 == 0):
            return -99999 #return val to be undefined
        co2Volt1 = (1/28)/mvdiff1
        co2Volt2 = (1/28)/mvdiff2
        co2Volt3 = (1/28)/mvdiff3
        average = (co2Volt1 + co2Volt2 + co2Volt3)/3
        return average
 
        
    @staticmethod
    def calculatePercentCO2(calibration, sample, zero):
        """
        Calculates and returns the %CO2 concentration.
        """
        
        percentCO2 = calibration * (sample - zero)
        return percentCO2
    
    
    @staticmethod
    def calculateUbarCO2(percentCO2):
        """
        Calculates and returns the ubar CO2 concentration from the %CO2.
        """
        
        ubarCO2 = percentCO2 * 9200
        return ubarCO2
    
    
    @staticmethod
    def calculateO2Air(temperature):
        """
        Calculates and returns O2 air value using the given temperature in degrees C.
        """
        
        result = -0.0018 * pow(temperature, 3) + 0.2229 * pow(temperature, 2) - 12.387 * temperature + 456.49
        return result
    
    
    @staticmethod
    def calculateO2Cal(o2Air, o2Zero):
        """
        Calculates and returns the O2 calibration value from the given O2 air value and
        O2 standard and measured values.
        """
        
        result = o2Air / o2Zero
        return result
    
    
    @staticmethod
    def calculateUbarO2(o2Cal, o2Measured):
        """
        Calculates and returns µBar O2 concentration given a previously calculated O2
        calibration and a new Mass 32 measurement.
        """
        
        result = o2Cal * o2Measured
        return result

    
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
            
