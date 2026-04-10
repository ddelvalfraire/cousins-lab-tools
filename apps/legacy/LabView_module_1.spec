# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['Code\\Module_Main_1_3\\Application\\mainUI\\mian.py'],
    pathex=['.', 'Code'],
    binaries=[],
    datas=[('Code\\Module_Main_1_3\\Application\\mainUI\\spinner50px.gif', 'Code/Module_Main_1_3/Application/mainUI')],
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
    name='LabView_module_1',
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
