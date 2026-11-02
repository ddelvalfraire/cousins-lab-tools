# change-file-reading
# This will contain a class for the thread to notify that a new file has been added
# As soon as a new file is found, it will add them to the shared memory.
import os
import sys
from threading import Event

from PyQt5.QtCore import QObject
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

sys.path.insert(0, "../read_data")

from Code.Module_Main_1_3.Application.read_data.sharedSingleton import SharedSingleton


class NewFileNotifierThread(QObject):
    def __init__(self, folder_path):
        super().__init__()
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
            with self.sharedData.lock:
                self.sharedData.fileList.append(os.path.basename(file_path))
            # print("New file added:", os.path.basename(file_path))
