"""Run from the repository root with:
    .venv/bin/python apps/legacy/tests/check_capture_titles.py.

Module 4 opens a Tk window, so run under xvfb-run on a host without a display.
Each entry point runs in a separate process because the apps share import names.
Only dialogs and the continuous acquisition loop are replaced during checks.
"""

import contextlib
import importlib
import io
import os
import runpy
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

REPO = Path(__file__).resolve().parents[1]
# Modules 1 and 2 share one code base and are checked through their window classes.
SHARED = {
    "Code/Module_Main_1_3/Application/mainUI/module1.py": "LabViewModule1",
    "Code/Module_Main_1_3/Application/mainUI/module2.py": "LabViewModule2",
}
ENTRIES = [*SHARED, "module3/application/mainUI/main.py"]
ENTRIES += ["module4/application/main.py"]


def check_shared(entry, class_name):
    from PyQt5.QtCore import QThread
    from PyQt5.QtWidgets import QApplication, QFileDialog

    sys.path.insert(0, str(REPO))
    module = importlib.import_module(
        ".".join(entry.relative_to(REPO).with_suffix("").parts)
    )
    with tempfile.TemporaryDirectory(prefix="capture title ") as temp:
        # The window writes its settings under the working directory.
        os.chdir(temp)
        app = QApplication([])
        window = getattr(module, class_name)(1280, 800, app)
        frame = window.rawDataPlotFrame
        try:
            assert window.windowTitle() == "LabView", window.windowTitle()
            assert frame.folder_path == ""
            assert frame.EZViewPath is None

            for parent in ("first experiment", "second experiment"):
                folder = Path(temp) / parent / "Capture café"
                folder.mkdir(parents=True)
                spool = Path(temp) / parent / "spool café.txt"
                spool.touch()
                selections = [
                    (
                        window.select_folder_action,
                        folder,
                        "getExistingDirectory",
                        str(folder),
                    ),
                    (
                        window.select_ezview_action,
                        spool,
                        "getOpenFileName",
                        (str(spool), ""),
                    ),
                ]
                for action, path, dialog, picked in selections:
                    with patch.object(QFileDialog, dialog, return_value=picked):
                        action.trigger()
                    expected = f"LabView - {path}"
                    assert window.windowTitle() == expected, (
                        window.windowTitle(),
                        expected,
                    )
                    if action is window.select_folder_action:
                        assert frame.folder_path == str(folder)
                        assert frame.EZViewPath is None
                        assert Path.cwd() == folder.resolve()
                    else:
                        assert frame.EZViewPath == str(spool)
                    assert window.application_state == "Folder_Selected"
                    assert not window.select_folder_action.isEnabled()
                    assert not window.select_ezview_action.isEnabled()

                    with (
                        patch.object(
                            QFileDialog, "getExistingDirectory", return_value=""
                        ),
                        patch.object(
                            QFileDialog, "getOpenFileName", return_value=("", "")
                        ),
                    ):
                        window.select_folder()
                        window.select_ezview()
                    assert window.windowTitle() == expected
                    selected = (frame.folder_path, frame.EZViewPath)
                    assert str(path) in selected, selected

                    # Plot All keeps the path while it reports progress.
                    with patch.object(QThread, "start"):
                        frame.plotAllButtonPressed()
                    frame.plotAllThread.secondsAt.emit("5")
                    assert window.windowTitle() == f"{expected}: processing 5", (
                        window.windowTitle()
                    )
                    frame.endPlotAllThread()

                    window.clearApplication(False)
                    assert window.windowTitle() == "LabView"
                    assert frame.folder_path == ""
                    assert frame.EZViewPath is None
                    assert window.application_state == "Idle"
                    assert window.select_folder_action.isEnabled()
                    assert window.select_ezview_action.isEnabled()

            with (
                patch.object(QFileDialog, "getExistingDirectory", return_value=""),
                patch.object(QFileDialog, "getOpenFileName", return_value=("", "")),
            ):
                window.select_folder_action.trigger()
                window.select_ezview_action.trigger()
            assert window.application_state == "Idle"
            assert window.windowTitle() == "LabView"
            assert frame.folder_path == ""
            assert frame.EZViewPath is None
        finally:
            window.close()
            app.processEvents()


def check_qt(entry):
    from PyQt5.QtWidgets import QApplication, QFileDialog

    app_dir = entry.parent
    sys.path[:0] = [
        str(app_dir),
        str(app_dir.parent / "read-data"),
        str(app_dir.parent / "uiElements"),
        str(app_dir.parent / "calculations"),
    ]
    os.chdir(app_dir)
    with patch.object(QApplication, "exec_", return_value=0):
        namespace = runpy.run_path(str(entry))
    window = namespace["labView"]
    app = namespace["app"]
    try:
        assert window.windowTitle() == "LabView", window.windowTitle()
        assert window.folder_path == ""
        with tempfile.TemporaryDirectory(prefix="capture title ") as temp:
            work = Path(temp) / "mainUI"
            work.mkdir()
            os.chdir(work)
            for parent in ("first experiment", "second experiment"):
                folder = Path(temp) / parent / "Capture café"
                folder.mkdir(parents=True)
                with patch.object(
                    QFileDialog, "getExistingDirectory", return_value=str(folder)
                ):
                    window.select_folder_action.trigger()
                expected = f"LabView - {folder}"
                assert window.windowTitle() == expected, (
                    window.windowTitle(),
                    expected,
                )
                assert window.folder_path == str(folder)
                assert Path.cwd() == folder.resolve()
                assert window.application_state == "Folder_Selected"
                assert not window.select_folder_action.isEnabled()
                with patch.object(QFileDialog, "getExistingDirectory", return_value=""):
                    window.select_folder()
                assert window.windowTitle() == expected
                assert window.folder_path == str(folder)
                window.clearApplication(False)
                assert window.windowTitle() == "LabView"
                assert window.folder_path == ""
                assert window.select_folder_action.isEnabled()

            with patch.object(QFileDialog, "getExistingDirectory", return_value=""):
                window.select_folder_action.trigger()
            assert window.application_state == "Idle"
            assert window.windowTitle() == "LabView"
            assert window.folder_path == ""

            if hasattr(window, "select_ezview_action"):
                os.chdir(work)
                with patch.object(
                    QFileDialog, "getOpenFileName", return_value=("", "")
                ):
                    window.select_ezview_action.trigger()
                assert not (Path(temp) / "Acquisitions").exists()
                assert window.application_state == "Idle"
                assert window.windowTitle() == "LabView"
                spool = Path(temp) / "spool café.txt"
                spool.touch()
                with (
                    patch.object(
                        QFileDialog, "getOpenFileName", return_value=(str(spool), "")
                    ),
                    patch.object(namespace["threading"], "Thread") as thread,
                ):
                    window.select_ezview_action.trigger()
                    thread.return_value.start.assert_called_once()
                    output, selected_spool = thread.call_args.kwargs["args"]
                assert selected_spool == str(spool)
                assert Path(output).is_dir()
                assert window.windowTitle() == f"LabView - {output}"
                assert window.folder_path == output
                assert Path.cwd() == Path(output).resolve()
                window.clearApplication(True)
                assert window.windowTitle() == "LabView"
                assert window.folder_path == ""
    finally:
        window.close()
        app.processEvents()


def check_console(entry):
    from tkinter import filedialog

    import pandas as pd

    with tempfile.TemporaryDirectory(prefix="capture café ") as temp:
        os.chdir(temp)
        with patch.object(filedialog, "askopenfilename", return_value=""):
            try:
                runpy.run_path(str(entry))
            except SystemExit as exc:
                assert exc.code == 0, exc.code
            else:
                raise AssertionError("Cancel did not exit")
        assert not Path("Acquisitions").exists()

        spool = Path(temp) / "spool.txt"
        spool.write_text(
            "10/19/26 12:00:00.000000000\t" + "00000001" * 12 + "0000ffffffff\n"
        )
        output = io.StringIO()
        original_to_csv = pd.DataFrame.to_csv

        def write_one_frame(frame, *args, **kwargs):
            original_to_csv(frame, *args, **kwargs)
            raise StopIteration("Capture check complete")

        console_title = Mock()
        with (
            contextlib.ExitStack() as platform_patches,
            patch.object(filedialog, "askopenfilename", return_value=str(spool)),
            contextlib.redirect_stdout(output),
            patch.object(output, "isatty", return_value=True),
            patch("time.sleep"),
            patch.object(pd.DataFrame, "to_csv", write_one_frame),
        ):
            if os.name == "nt":
                platform_patches.enter_context(
                    patch("ctypes.windll.kernel32.SetConsoleTitleW", console_title)
                )
            namespace = runpy.run_path(str(entry))
        folder = Path(temp).resolve() / "Acquisitions/Acquisition0"
        if os.name == "nt":
            console_title.assert_called_once_with(f"LabView - {folder}")
        else:
            assert f"\033]0;LabView - {folder}\007" in output.getvalue(), (
                output.getvalue()
            )
        assert (folder / "0.csv").is_file()
        shape = pd.read_csv(folder / "0.csv", header=None).shape
        assert shape == (1, 11), shape

        # Exercise the Windows API branch on hosts that cannot run Windows builds.
        import ctypes
        from types import SimpleNamespace

        console_title = Mock()
        windows = SimpleNamespace(
            kernel32=SimpleNamespace(SetConsoleTitleW=console_title)
        )
        with (
            patch.object(os, "name", "nt"),
            patch.object(ctypes, "windll", windows, create=True),
        ):
            namespace["set_capture_title"](str(folder))
        console_title.assert_called_once_with(f"LabView - {folder}")
        output = io.StringIO()
        with contextlib.redirect_stdout(output), patch.object(os, "name", "posix"):
            namespace["set_capture_title"](str(folder))
        assert output.getvalue() == "", output.getvalue()
        namespace["spool_file"].close()
        namespace["root"].destroy()


if __name__ == "__main__":
    if len(sys.argv) == 2:
        entry = REPO / sys.argv[1]
        if sys.argv[1] in SHARED:
            check_shared(entry, SHARED[sys.argv[1]])
        elif entry == REPO / ENTRIES[-1]:
            check_console(entry)
        else:
            check_qt(entry)
        print(f"PASS {sys.argv[1]}")
    else:
        for entry in ENTRIES:
            subprocess.run(
                [sys.executable, __file__, entry],
                check=True,
                env={
                    **os.environ,
                    "QT_QPA_PLATFORM": "offscreen",
                    "PYTHONDONTWRITEBYTECODE": "1",
                },
            )
