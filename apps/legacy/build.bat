echo Starting Build
pyinstaller --noconfirm LabView_modules.spec || exit /b 1
Echo Done
