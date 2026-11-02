# -*- mode: python ; coding: utf-8 -*-
# Builds LabView_module_1.exe and LabView_module_2.exe into dist/. Run from
# apps/legacy:
#
#   pyinstaller --noconfirm LabView_modules.spec
#
# Each module is its own one-file, windowed executable with the shared code
# bundled in, so either file runs on its own.

MODULES = {
    "LabView_module_1": "Code/Module_Main_1_3/Application/MainAndBuildFiles/mianMoudle1.py",
    "LabView_module_2": "Code/Module_Main_1_3/Application/MainAndBuildFiles/mianMoudle2.py",
}

for name, script in MODULES.items():
    a = Analysis(
        [script],
        pathex=[".", "Code"],
        binaries=[],
        datas=[
            (
                "Code/Module_Main_1_3/Application/mainUI/spinner50px.gif",
                "Code/Module_Main_1_3/Application/mainUI",
            )
        ],
        hiddenimports=[],
        hookspath=[],
        hooksconfig={},
        runtime_hooks=[],
        excludes=[],
        noarchive=False,
        optimize=0,
    )
    pyz = PYZ(a.pure)

    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        [],
        name=name,
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )
