
"""
__author__ = "Ritik Agarwal, Zoe Parker"
__credits__ = ["Ritik Agarwal", "Zoe Parker"]
__version__ = "1.0.0"
__maintainer__ = ""
__email__ = ["agarwal.ritik1101@gmail.com", "zoeparker@comcast.net"]
__status__ = "Completed"
"""

# change-file-reading
# This will contain a class for the thread to notify that a new file has been added
# As soon as a new file is found, it will add them to the shared memory.
import sys
from threading import Event
import os
from PyQt5.QtCore import QObject
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

sys.path.insert(0, '../read-data')

from sharedSingleton import SharedSingleton

class NewFileNotifierThread(QObject):

    def __init__(self, folder_path):
        super(NewFileNotifierThread, self).__init__()
        self.folder_path = folder_path
        self.stopped = Event()

    def run(self):
        # print("Thread Started")
        event_handler = NewFileHandler()
        self.observer = Observer()
        self.observer.schedule(event_handler, self.folder_path, recursive=False)
        self.observer.start()

        try:
            self.stopped.wait()
        finally:
            self.observer.stop()
            self.observer.join()

    def stop(self):
        self.stopped.set()


class NewFileHandler(FileSystemEventHandler):
    def __init__(self):
        super().__init__()
        self.sharedData = SharedSingleton()

    def on_created(self, event):
        if not event.is_directory:
            self.callback(event.src_path)

    def callback(self, file_path):
        if os.path.isfile(file_path):
            self.sharedData.fileList.append(os.path.basename(file_path))
            # print("New file added:", os.path.basename(file_path))

    
