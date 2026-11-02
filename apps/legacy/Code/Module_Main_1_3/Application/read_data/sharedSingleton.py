
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import threading

class SharedSingleton(object):
    _lock = threading.Lock()

    def __new__(cls):
        if not hasattr(cls, 'instance'):
            with cls._lock:
                if not hasattr(cls, 'instance'):
                    cls.instance = super(SharedSingleton, cls).__new__(cls)
                    cls.instance._init_once()
        return cls.instance

    def _init_once(self):
        self.lock = threading.Lock()
        self.dataPoints = {}
        self.da49data = {}
        self.a49data = {}
        self.fileList = []
        self.folderAccessed = False
        self.xPoint = 0
        self.initialX = None
