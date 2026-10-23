
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

class SharedSingleton(object):

    def __new__(cls):
        if not hasattr(cls, 'instance'):
            cls.instance = super(SharedSingleton, cls).__new__(cls)
        return cls.instance
