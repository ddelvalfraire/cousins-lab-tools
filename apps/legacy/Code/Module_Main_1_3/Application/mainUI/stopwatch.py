
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

import time

class Stopwatch:

    def __init__(self):
        self.start_time = None
        self.pause_time = None
        self.elapsed_time = 0
        self.paused = False
        self.speed_factor = 1.0

    def start(self):
        if self.start_time is not None:
            # Stopwatch was already started, do nothing
            return

        self.start_time = time.time()

    def stop(self):
        if self.start_time is None:
            # Stopwatch was not started, do nothing
            return

        if not self.paused:
            self.elapsed_time += time.time() - self.start_time

        self.start_time = None
        self.pause_time = None
        self.paused = False

    def pause(self):
        if self.start_time is None or self.paused:
            # Stopwatch was not started or is already paused, do nothing
            return

        self.pause_time = time.time()
        self.paused = True

    def resume(self):
        if not self.paused:
            # Stopwatch is not paused, do nothing
            return

        self.start_time += time.time() - self.pause_time
        self.pause_time = None
        self.paused = False

    def get_elapsed_time(self):
        if self.start_time is None:
            return self.elapsed_time * 1000

        if self.paused:
            return (self.elapsed_time + self.pause_time - self.start_time) * 1000 * self.speed_factor

        current_time = time.time()
        elapsed = (current_time - self.start_time) * 1000 * self.speed_factor
        self.elapsed_time += elapsed
        self.start_time = current_time
        return self.elapsed_time
    
    def set_speed(self, factor):
        
        self.last_time = time.time()
        self.speed_factor = factor
    
    def set_elapsed_time(self, seconds):
        self.elapsed_time = seconds*1000
        
