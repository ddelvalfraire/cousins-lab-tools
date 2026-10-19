"""Run with .venv/bin/python tests/check_capture_titles.py.

Each entry point runs in a separate process because the apps share import names.
Only dialogs and the continuous acquisition loop are replaced during checks.
"""

import contextlib
import io
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
from unittest.mock import Mock, patch


REPO = Path(__file__).resolve().parents[1]
ENTRIES = [f"module{i}/application/mainUI/main.py" for i in (1, 2, 3)]
ENTRIES += ["module4/application/main.py"]


def check_qt(entry):
    from PyQt5.QtWidgets import QApplication, QFileDialog

    app_dir = entry.parent
    sys.path[:0] = [str(app_dir), str(app_dir.parent / 'read-data'),
                    str(app_dir.parent / 'uiElements'), str(app_dir.parent / 'calculations')]
    os.chdir(app_dir)
    with patch.object(QApplication, 'exec_', return_value=0):
        namespace = runpy.run_path(str(entry))
    window = namespace['labView']
    app = namespace['app']
    try:
        assert window.windowTitle() == 'LabView', window.windowTitle()
        assert window.folder_path == ''
        with tempfile.TemporaryDirectory(prefix='capture title ') as temp:
            work = Path(temp) / 'mainUI'
            work.mkdir()
            os.chdir(work)
            for parent in ('first experiment', 'second experiment'):
                folder = Path(temp) / parent / 'Capture café'
                folder.mkdir(parents=True)
                with patch.object(QFileDialog, 'getExistingDirectory', return_value=str(folder)):
                    window.select_folder_action.trigger()
                expected = f'LabView - {folder}'
                assert window.windowTitle() == expected, (window.windowTitle(), expected)
                assert window.folder_path == str(folder)
                assert Path.cwd() == folder.resolve()
                assert window.application_state == 'Folder_Selected'
                assert not window.select_folder_action.isEnabled()
                with patch.object(QFileDialog, 'getExistingDirectory', return_value=''):
                    window.select_folder()
                assert window.windowTitle() == expected
                assert window.folder_path == str(folder)
                window.clearApplication(False)
                assert window.windowTitle() == 'LabView'
                assert window.folder_path == ''
                assert window.select_folder_action.isEnabled()

            with patch.object(QFileDialog, 'getExistingDirectory', return_value=''):
                window.select_folder_action.trigger()
            assert window.application_state == 'Idle'
            assert window.windowTitle() == 'LabView'
            assert window.folder_path == ''

            if hasattr(window, 'select_ezview_action'):
                os.chdir(work)
                with patch.object(QFileDialog, 'getOpenFileName', return_value=('', '')):
                    window.select_ezview_action.trigger()
                assert not (Path(temp) / 'Acquisitions').exists()
                assert window.application_state == 'Idle'
                assert window.windowTitle() == 'LabView'
                spool = Path(temp) / 'spool café.txt'
                spool.touch()
                with patch.object(QFileDialog, 'getOpenFileName', return_value=(str(spool), '')), \
                        patch.object(namespace['threading'], 'Thread') as thread:
                    window.select_ezview_action.trigger()
                    thread.return_value.start.assert_called_once()
                    output, selected_spool = thread.call_args.kwargs['args']
                assert selected_spool == str(spool)
                assert Path(output).is_dir()
                assert window.windowTitle() == f'LabView - {output}'
                assert window.folder_path == output
                assert Path.cwd() == Path(output).resolve()
                window.clearApplication(True)
                assert window.windowTitle() == 'LabView'
                assert window.folder_path == ''
    finally:
        window.close()
        app.processEvents()


def check_console(entry):
    import pandas as pd
    from tkinter import filedialog

    with tempfile.TemporaryDirectory(prefix='capture café ') as temp:
        os.chdir(temp)
        with patch.object(filedialog, 'askopenfilename', return_value=''):
            try:
                runpy.run_path(str(entry))
            except SystemExit as exc:
                assert exc.code == 0, exc.code
            else:
                raise AssertionError('Cancel did not exit')
        assert not Path('Acquisitions').exists()

        spool = Path(temp) / 'spool.txt'
        spool.write_text('10/19/26 12:00:00.000000000\t' + '00000001' * 12 + '0000ffffffff\n')
        output = io.StringIO()
        original_to_csv = pd.DataFrame.to_csv

        def write_one_frame(frame, *args, **kwargs):
            original_to_csv(frame, *args, **kwargs)
            raise StopIteration('Capture check complete')

        console_title = Mock()
        with contextlib.ExitStack() as platform_patches, \
                patch.object(filedialog, 'askopenfilename', return_value=str(spool)), \
                contextlib.redirect_stdout(output), patch.object(output, 'isatty', return_value=True), \
                patch('time.sleep'), patch.object(pd.DataFrame, 'to_csv', write_one_frame):
            if os.name == 'nt':
                platform_patches.enter_context(patch('ctypes.windll.kernel32.SetConsoleTitleW', console_title))
            namespace = runpy.run_path(str(entry))
        folder = Path(temp).resolve() / 'Acquisitions/Acquisition0'
        if os.name == 'nt':
            console_title.assert_called_once_with(f'LabView - {folder}')
        else:
            assert f'\033]0;LabView - {folder}\007' in output.getvalue(), output.getvalue()
        assert (folder / '0.csv').is_file()
        shape = pd.read_csv(folder / '0.csv', header=None).shape
        assert shape == (1, 11), shape

        # Exercise the Windows API branch on hosts that cannot run Windows builds.
        import ctypes
        from types import SimpleNamespace
        console_title = Mock()
        windows = SimpleNamespace(kernel32=SimpleNamespace(SetConsoleTitleW=console_title))
        with patch.object(os, 'name', 'nt'), patch.object(ctypes, 'windll', windows, create=True):
            namespace['set_capture_title'](str(folder))
        console_title.assert_called_once_with(f'LabView - {folder}')
        output = io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(os, 'name', 'posix'):
            namespace['set_capture_title'](str(folder))
        assert output.getvalue() == '', output.getvalue()
        namespace['spool_file'].close()
        namespace['root'].destroy()


if __name__ == '__main__':
    if len(sys.argv) == 2:
        entry = REPO / sys.argv[1]
        if entry == REPO / ENTRIES[-1]:
            check_console(entry)
        else:
            check_qt(entry)
        print(f'PASS {sys.argv[1]}')
    else:
        for entry in ENTRIES:
            subprocess.run([sys.executable, __file__, entry], check=True,
                           env={**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'PYTHONDONTWRITEBYTECODE': '1'})
