# Mass Spectrometer Interface Design

cousins-lab-tools · WSU Cousins Plant Biology Lab · design views derived from the code on `main` at 30a3fc4

1. [High-level design](#s1)
2. [Data flow diagrams](#s2)
3. [Data model](#s3)
4. [Domain model](#s4)
5. [Program design (LLD)](#s5)
6. [Module dependency graph](#s6)
7. [Program flow](#s7)
8. [High-level design graph](#s8)
9. [Onboarding views](#s9)

## 1. High-level design

### 1.1 Purpose and scope

Desktop tooling for viewing, calibrating and logging mass spectrometer data used in plant respiration experiments. Four modules ship: three are copies of one PyQt5 acquisition viewer that differ only in which channels they draw and which derived quantity they compute; the fourth converts the secondary spectrometer's EZView spool file into the per-frame CSV format the viewers read. Audience: the students maintaining the code and the lab staff running it.

### 1.2 System context

```mermaid
flowchart LR
  sci([Bench scientist])
  op([Instrument operator])
  ms1[Primary mass spectrometer<br/>LabVIEW acquisition]
  ms2[Secondary mass spectrometer<br/>EZView spool]
  xl[Excel]
  subgraph sys[cousins-lab-tools]
    conv[Module 4<br/>spool to CSV converter]
    view[Modules 1 to 3<br/>acquisition viewer]
  end
  ms1 -- "k.csv per tick" --> view
  ms2 -- "spool .txt" --> conv
  conv -- "k.csv per frame" --> view
  op --> conv
  sci -- "select folder, start, place bars" --> view
  view -- "calibrations, table, raw export CSV" --> xl
```

Figure 1.1 System context. The only integration point between instrument side and viewer side is a folder of CSV frames.

### 1.3 Component architecture

```mermaid
flowchart TB
  subgraph viewer["Acquisition viewer (one process)"]
    direction TB
    ui[Window shell<br/>LabView QMainWindow]
    plot[Plot widgets<br/>Graph, Curve, mean bars]
    calc[Calculations<br/>static formulas]
    replay[Replay engine<br/>Worker, PlotAllThread, Stopwatch]
    reader[Folder reader<br/>DataUtility, GetData, File]
    watch[Folder watcher<br/>NewFileNotifierThread]
    shared[(SharedSingleton<br/>fileList, dataPoints)]
    ez[read_from_ezview<br/>modules 1 and 2 only]
  end
  folder[(Acquisition folder)]
  spool[(EZView spool)]
  docs[(Documents CSVs)]
  ui --> plot
  ui --> calc
  ui --> replay
  ui --> watch
  replay --> reader
  reader --> folder
  watch --> folder
  reader --> shared
  watch --> shared
  replay -- "newDataPointSignal" --> ui
  ui --> shared
  plot --> shared
  calc --> shared
  ui --> docs
  spool --> ez
  ez --> folder
```

Figure 1.2 Components inside one viewer instance and the files it touches.

### 1.4 Technology stack

Technology stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | Python 3 | README says 3.1+; code uses f-strings, so 3.6+ in practice |
| GUI | PyQt5 | QMainWindow, QThread, signals and slots |
| Plotting | pyqtgraph | PlotWidget, PlotDataItem, LinearRegionItem for the mean bars |
| File watching | watchdog | Observer on the acquisition folder |
| Data | pandas, numpy | read_csv per frame; polyfit for module 3 slope |
| Packaging | PyInstaller | one `main.spec` per module, output in git-ignored `dist/` |
| Storage | CSV files | no database |
| Module 4 picker | tkinter | hidden root plus file dialog |

### 1.5 Components, inputs and outputs

Components, inputs and outputs

| Component | Input | Output | Files |
| --- | --- | --- | --- |
| Folder reader | folder path; fileList index | (x, \[y0…y7\]) or False | `read-data/` |
| Folder watcher | filesystem create events | appended fileList entries | `mainUI/newFileNotifierThread.py` |
| Replay engine | stopwatch time; reader tuples | batches of tuples via Qt signal; end-of-data signal | `mainUI/worker.py`, `plotAllThread.py`, `stopwatch.py` |
| Window shell | signals; button clicks; line-edit text | dataPoints writes; widget updates; CSV files | `mainUI/main.py` |
| Plot widgets | x keys from singleton; y lists | rendered curves | `uiElements/` |
| Calculations | dataPoints, window bounds, scalars | floats | `calculations/Calculations.py` |
| Spool converter | spool .txt | Acquisitions/AcquisitionN/k.csv | `module4/application/main.py`, `read-data/readEZView.py` |

### 1.6 Module variants

Module variants

|  | Module 1 | Module 2 | Module 3 |
| --- | --- | --- | --- |
| Curves drawn | all 8 masses | m32, m44, uBar, D\[uBar\] | m45, m47, m49, atom49%, D\[atom49%\] |
| Per-frame derived value | none | µbar CO2 = 9200 · cal · (m44 − zero); D = previous − current | ln(100 · m49 / (m45 + m47 + m49)); slope of last 15 points |
| Calibration inputs | 12: temp, O2 cal, O2 zero, BiCarb/CO2, CO2 0/6/12/18 µL, BiCarb 0/2/4/6 µL | CO2 volt, CO2 zero, CO2 sample, O2 temp, O2 zero, O2 average | CO2 0/1/2/3 µL, CO2 zero, CO2 sample |
| Table row | vO, vC, \[CO2\], \[O2\] | %CO2, µbar CO2, µbar O2 | atom%49 mean |
| Spool import | yes | yes | no |
| Extra singleton stores | — | — | a49data, da49data |

### 1.7 Constraints and assumptions

- Output paths are hard-coded to `C:\Users\<login>\Documents\…`; Windows only as written.
- Frames arrive as one CSV file each, natural-sortable by name; the first frame read defines the time origin.
- Column order in a frame is fixed: time_ms then m32, m34, m36, m44, m45, m46, m47, m49.
- One viewer instance reads one folder; there is no concurrent multi-folder use.
- `module3/main.py` at the module root is a stale merge of modules 2 and 3; the canonical module 3 entry point is `module3/application/mainUI/main.py`.

## 2. Data flow diagrams

Gane–Sarson conventions: processes are numbered rounded boxes, data stores are labelled D*n*, external entities are plain boxes.

### 2.1 Level 0 (context)

```mermaid
flowchart LR
  ms[Mass spectrometers]
  sci[Bench scientist]
  xl[Excel]
  p0(["0<br/>Acquisition viewing<br/>and calibration"])
  ms -- "frames (spool or CSV)" --> p0
  sci -- "folder choice, run control,<br/>window bounds, cal entries" --> p0
  p0 -- "live plots, readings" --> sci
  p0 -- "calibration / table / raw CSV" --> xl
```

Figure 2.1 Level 0.

### 2.2 Level 1

```mermaid
flowchart TB
  ms2[Secondary MS]
  ms1[Primary MS]
  sci[Bench scientist]
  xl[Excel]
  p1(["1<br/>Decode spool frame"])
  p2(["2<br/>Register new file"])
  p3(["3<br/>Read frame"])
  p4(["4<br/>Pace replay"])
  p5(["5<br/>Update plots and derived values"])
  p6(["6<br/>Compute window statistics"])
  p7(["7<br/>Export CSV"])
  d1[("D1 Acquisition folder")]
  d2[("D2 fileList")]
  d3[("D3 dataPoints")]
  d4[("D4 Documents CSVs")]
  ms2 -- "hex lines" --> p1
  p1 -- "k.csv" --> d1
  ms1 -- "k.csv" --> d1
  d1 -- "create event" --> p2
  p2 -- "basename" --> d2
  d2 -- "fileList[i]" --> p3
  d1 -- "csv rows" --> p3
  p3 -- "(x, y[8])" --> p4
  p4 -- "batch of tuples" --> p5
  p5 -- "dataPoints[x] = y" --> d3
  d3 -- "x keys" --> p5
  p5 -- "curves" --> sci
  sci -- "bar region, button" --> p6
  d3 -- "y in window" --> p6
  p6 -- "mean, slope, cal" --> sci
  sci -- "save" --> p7
  d3 --> p7
  p7 --> d4
  d4 --> xl
```

Figure 2.2 Level 1. Process 4 is the Worker timer or the PlotAllThread drain; process 5 is `update_plot_data` on the main thread.

### 2.3 Data flow dictionary

Data flow dictionary

| Flow | Structure | From → To |
| --- | --- | --- |
| hex lines | "MM/DD/YY HH:MM:SS.ffffff" TAB hex, frame ends at `ffffffff` | Secondary MS → 1 |
| k.csv | one row: time_ms, ch5, ch2, ch4, ch3, ch1, ch6, ch7, ch8 (no header) | 1 or Primary MS → D1 |
| basename | "k.csv" | 2 → D2 |
| (x, y\[8\]) | x seconds since first frame; y column means | 3 → 4 |
| batch of tuples | list of (x, y\[8\]) emitted by `newDataPointSignal` | 4 → 5 |
| bar region | (xleft, xright) from `meanBar.getRegion()` | Scientist → 6 |
| mean, slope, cal | rounded floats to line edits | 6 → Scientist |

## 3. Data model

There is no database. Persistent data is CSV with fixed column order; runtime data is dictionaries on one singleton. The ER diagram treats each file type and each in-memory structure as an entity.

```mermaid
erDiagram
  ACQUISITION_FOLDER ||--o{ FRAME_CSV : contains
  FRAME_CSV ||--|| DATA_POINT : "reduces to"
  DATA_POINT }o--|| DATAPOINTS_DICT : "stored in"
  DATAPOINTS_DICT ||--o| RAW_EXPORT_CSV : exports
  DATAPOINTS_DICT ||--o{ WINDOW_READING : "mean or slope over"
  WINDOW_READING }o--|| CALIBRATION_CSV : "saved as"
  WINDOW_READING }o--o{ TABLE_ROW : "combines into"
  TABLE_ROW }o--|| TABLE_CSV : "saved as"
  SPOOL_FRAME ||--|| FRAME_CSV : "converted to"

  SPOOL_FRAME {
    datetime timestamp "%m/%d/%y %H:%M:%S.%f"
    int32 channel1_12 "big-endian / 234800968 * scale"
    hex gainSetting
  }
  FRAME_CSV {
    int time_ms PK
    float y0_m32
    float y1_m34
    float y2_m36
    float y3_m44
    float y4_m45
    float y5_m46
    float y6_m47
    float y7_m49
  }
  DATA_POINT {
    float x "s since first frame"
    list y "8 floats, mV"
  }
  DATAPOINTS_DICT {
    float x PK
    list y
  }
  WINDOW_READING {
    float xleft
    float xright
    int curve_index
    float value
  }
  CALIBRATION_CSV {
    string header_row
    string value_row
  }
  TABLE_ROW {
    float vO
    float vC
    float co2_conc
    float o2_conc
  }
  TABLE_CSV {
    string rows
  }
  RAW_EXPORT_CSV {
    int Count
    float Time_ms
    float m32_to_m49
  }
```

Figure 3.1 Entity–relationship view of files and runtime structures. TABLE_ROW columns shown for module 1.

### 3.1 Data dictionary

Data dictionary

| Entity | Field | Type | Rule |
| --- | --- | --- | --- |
| Spool frame | timestamp | datetime | first tab field of the first line; last 4 chars dropped before parse |
|  | channel n | int32 → float | hex slice \[8n−7 : 8n\], big-endian, ÷ 234800968, × scale (0.2, 20, 20, 0.1, then 1.0) |
|  | gainSetting | hex | slice \[97:\], dropped on write |
| Frame CSV | col 0 | int | ms since converter start (module 4) or LabVIEW timestamp |
|  | col 1…8 | float | after dropping ch9, ch10, gain and swapping ch1↔ch5, ch3↔ch4 |
| DataPoint | x | float | last row time ÷ 1000 − initialX |
|  | y | list\[8\] | column means of the file, column 0 removed |
| SharedSingleton | fileList | list\[str\] | natural sort on first listing; appended by watcher |
|  | dataPoints | dict\[float, list\] | insertion order equals time order |
|  | folderAccessed, initialX, xPoint | bool, float, float | set on first read |
|  | a49data, da49data | dict | module 3 only |
| Calibration CSV | row 1 | strings | m1: Temp, O2 Calibration, O2 Buffer Zero, BiCarb/CO2, CO2 Cal 0/6/12/18, BiCarb Cal 0/2/4/6 · m3: CO2 0µL…3µL, CO2 Zero, CO2 Sample |
|  | filename | string | `%d-%m-%y %H-%M-%S.csv` under Documents/Calibrations |
| Table CSV | rows | strings | every table cell, no header, Documents/TableData |
| Raw export CSV | header | strings | Count, Time, m32, m34, m36, m44, m45, m46, m47, m49 |

## 4. Domain model

Conceptual view, independent of Qt and of the file layout. Attributes are what the lab reasons about; operations are the things a scientist asks for.

```mermaid
classDiagram
  class Acquisition {
    folderPath
    timeOrigin
  }
  class Frame {
    elapsedSeconds
  }
  class MassReading {
    mass
    millivolts
  }
  class MeasurementWindow {
    xleft
    xright
    mean(mass)
    slope(mass)
  }
  class Calibration {
    temperature
    o2Calibration
    co2Calibration
    biCarbRatio
    fromKnownInjections()
    fromAirSolubility()
  }
  class Sample {
    blankRate
    extractRate
    netRate()
  }
  class ResultRow {
    vO
    vC
    co2Concentration
    o2Concentration
  }
  class ResultsTable {
    rows
    addRow()
    purge()
  }
  Acquisition "1" *-- "many" Frame
  Frame "1" *-- "8" MassReading
  MeasurementWindow --> Frame : selects
  Calibration ..> MeasurementWindow : built from
  Sample ..> MeasurementWindow : read from
  ResultRow ..> Calibration : scaled by
  ResultRow ..> Sample : derived from
  ResultsTable "1" o-- "many" ResultRow
```

Figure 4.1 Domain model. Masses are 32, 34, 36, 44, 45, 46, 47, 49.

### 4.1 Domain rules

Domain rules

| Rule | Definition | Implemented in |
| --- | --- | --- |
| Time origin | elapsed = t_last_ms / 1000 − initialX, initialX taken from the first frame of the session | `File.__next__` |
| Window mean | mean of a mass over frames with xleft ≤ x ≤ xright, 4 dp; bounds snap to nearest frame; out of range → "undefined" | `Calculations.getMean` |
| O2 air solubility | −0.0018 T³ + 0.2229 T² − 12.387 T + 456.49 | `calculate02Calibration`, `calculateO2Air` |
| O2 calibration | solubility ÷ mean mV of air-equilibrated water; µbar O2 = O2cal × m32 mean | `calculateO2Cal`, `calculateUbarO2` |
| CO2 calibration (m1) | slope = Δconcentration ÷ ΔmV across cal points; intercept = c₀ − slope · mV₀ | `calculateSlope`, `calculateIntercept` |
| CO2 (m2) | %CO2 = cal × (m44 − zero); µbar = %CO2 × 9200 | `calculatePercentCO2`, `calculateUbarCO2` |
| Net rate and velocity (m1) | net = extract slope − blank slope; vO = −net × O2cal; vC = −net × CO2cal; \[CO2\] = CO2cal × (m44 − zero44) ÷ BiCarb ratio | `extractButtonPressed` |
| atom%49 (m3) | 100 × m49 ÷ (m45 + m47 + m49) with negatives clamped to 0; plotted as ln; rate = slope of linear fit over last 15 points | `calculateAtom49` |

## 5. Program design (LLD)

### 5.1 Class diagrams

```mermaid
classDiagram
  class LabView {
    -application_state : str
    -startBit, pauseBit : bool
    -delay : int = 200
    -stopwatch : Stopwatch
    -dataObj : GetData
    -curve1..curve8 : Curve
    -meanBar : LinearRegionItem
    +select_folder()
    +startButtonPressed()
    +plotAllButtonPressed()
    +pauseResumeAction()
    +update_plot_data(dataPoints)
    +meanButtonPressed(lineEdit, curve)
    +extractButtonPressed()
    +addToTableButtonPressed()
    +saveCalibrations() loadCals(path)
    +exportRawData()
    +clearApplication(keepCals)
  }
  class Curve {
    -data_line : PlotDataItem
    -x, y : list
    +plotCurve()
    +updateDataPoints(x, y)
    +hide() unhide() clear()
  }
  class Graph {
    +getXAxisRange() getYAxisRange()
    +setNewXRange() setNewYRange()
  }
  class Calculations {
    +getMean(dataPoints, xleft, xright, graph)$
    +calculate02Calibration(mean, temp)$
    +calculateSlope(dataPoints)$
    +calculateIntercept(dataPoints, slope)$
  }
  class Dialog {
    +Dialog(title, buttonCount, message)
  }
  QMainWindow <|-- LabView
  PlotWidget <|-- Graph
  QDialog <|-- Dialog
  LabView *-- "8" Curve
  LabView *-- "4" Graph
  LabView ..> Calculations
  LabView ..> Dialog
  Curve --> Graph : draws on
```

Figure 5.1a Window, widgets and formulas, as instantiated in module 1 (module 3 has three graphs). Frame, Button and LineEdit are trivial subclasses and are omitted. `$` marks static methods.

```mermaid
classDiagram
  class Worker {
    +newDataPointSignal, plotEndBitSignal, filesParsedSignal, finished
    -timer : QTimer
    -lastDataPoint, anchorTime
    +run()
    +getNextPoint()
    +isDataPointValid(dp)
  }
  class PlotAllThread {
    +newDataPointSignal, throwOutOfDataExceptionSignal, filesParsedSignal, finished
    +run()
  }
  class NewFileNotifierThread {
    -observer : Observer
    +run() stop()
  }
  class NewFileHandler {
    +on_created(event)
  }
  class Stopwatch {
    -start_time, elapsed_time, speed_factor
    +start() pause() resume() stop()
    +get_elapsed_time()
    +set_speed(f) set_elapsed_time(s)
  }
  class GetData {
    -currentFileIndex : int
    +setDirectory(path)
    +__next__() tuple or False
  }
  class File {
    -data : DataFrame
    +__next__() tuple
  }
  class DataUtility {
    +setDataDirectory(path)$
    +getDataFileList()$
  }
  class SharedSingleton {
    fileList, dataPoints, folderAccessed, initialX, xPoint
  }
  QObject <|-- Worker
  QObject <|-- PlotAllThread
  QObject <|-- NewFileNotifierThread
  FileSystemEventHandler <|-- NewFileHandler
  Worker --> GetData
  Worker --> Stopwatch
  PlotAllThread --> GetData
  PlotAllThread --> Stopwatch
  GetData --> File
  GetData --> DataUtility
  NewFileNotifierThread *-- NewFileHandler
  Worker --> SharedSingleton
  PlotAllThread --> SharedSingleton
  NewFileHandler --> SharedSingleton
  File --> SharedSingleton
```

Figure 5.1b Replay, reading and watching. LabView creates a Worker per Start, a PlotAllThread per Plot All, and one NewFileNotifierThread after the first folder listing.

### 5.2 Sequence: Start and replay

```mermaid
sequenceDiagram
  actor S as Scientist
  participant L as LabView (main thread)
  participant W as Worker (QThread)
  participant G as GetData / File
  participant O as Observer (watchdog)
  participant D as SharedSingleton
  S->>L: Start
  L->>W: create, moveToThread, started.connect(run)
  L->>L: stopwatch.start() or resume() if paused
  W->>D: fileList = getDataFileList()
  W-->>L: filesParsedSignal
  L->>O: NewFileNotifierThread.run()
  W->>W: QTimer(delay).start()
  loop every delay ms while not pauseBit
    W->>G: __next__()
    G->>D: read fileList[i]
    G-->>W: (x, y[8])
    W->>W: collect while frame time has passed on stopwatch
    W-->>L: newDataPointSignal(batch)
    L->>D: dataPoints[x] = y
    L->>L: curve.updateDataPoints(x, y)
  end
  O->>D: fileList.append(new file)
  G-->>W: False
  W->>W: timer.stop() and stopwatch.pause()
  W-->>L: plotEndBitSignal, finished
  L->>S: Out of data dialog
  L->>L: delayedRestart, then Start again
```

Figure 5.2 Replay. Pacing compares frame timestamps to the stopwatch, so a recording replays at its recorded rate times the speed factor.

### 5.3 Sequence: calibration point (module 1)

```mermaid
sequenceDiagram
  actor S as Scientist
  participant L as LabView
  participant C as Calculations
  participant D as SharedSingleton
  S->>L: drag mean bars
  S->>L: CO2 cal button (concentration c)
  L->>L: xleft, xright = meanBar.getRegion()
  L->>D: snap bounds to nearest keys
  L->>C: getMean(dataPoints, xleft, xright, 3)
  C-->>L: mean mV
  L->>L: lineEdit.setText(mean) and assayBufferData[c] = mean
  L->>C: calculateSlope(assayBufferData)
  L->>C: calculateIntercept(assayBufferData, slope)
  L->>L: co2BufferCalibration = slope, re-plot cal scatter
```

Figure 5.3 One calibration point. Extract and Blank follow the same shape with slope instead of mean.

### 5.4 Module descriptions

Module descriptions

| Module | Responsibility | Interface | Error handling |
| --- | --- | --- | --- |
| `mainUI/main.py` | Builds three scroll frames (raw plot, calculated plots, calculation panel and table); owns state and all slots | module-level: creates QApplication and LabView | Dialog subclass for every user-facing condition; undefined values written as text |
| `mainUI/worker.py` | Timed replay of frames | signals listed in 5.1; `run()`, `getNextPoint()` | False from reader → stop timer, emit plotEndBit |
| `mainUI/plotAllThread.py` | Drain all frames in one batch; fast-forward stopwatch | `run()` | Idle state → folder-not-selected signal; no data → out-of-data signal |
| `mainUI/newFileNotifierThread.py` | Watch folder, append new file names | `run()`, `stop()` | bare except stops observer |
| `mainUI/stopwatch.py` | Pausable wall clock with speed factor | start/pause/resume/stop/get_elapsed_time/set_speed/set_elapsed_time | no-ops on invalid transitions |
| `read-data/getData.py` | Cursor over fileList | `setDirectory(path)`, `__next__()` | returns False past end |
| `read-data/file.py` | One CSV → one (x, y) | `__next__()` | none; pandas errors propagate |
| `read-data/dataUtility.py` | chdir; natural-sorted listing | two static methods | none |
| `read-data/readEZView.py` | Tail spool, write frames | `read_from_ezview(folderPath, spoolPath)` | catch-all prints and exits loop |
| `calculations/Calculations.py` | Formulas | static methods | equal voltages → None; single point → 0 |
| `uiElements/curve.py` | One PlotDataItem | plotCurve, updateDataPoints, hide, unhide, clear | none |
| `module4/application/main.py` | Standalone spool → CSV | script; tkinter picker | catch-all prints and exits |

## 6. Module dependency graph

Three sibling folders are pushed onto `sys.path`, so every import is by bare module name. Edges from `main` to the fifteen application modules (fourteen in module 3, which lacks readEZView) are drawn once as a group edge to keep the graph readable.

```mermaid
flowchart LR
  main[mainUI/main.py]
  subgraph mainUI
    worker
    plotAllThread
    newFileNotifierThread
    stopwatch
  end
  subgraph uiElements
    curve
    graphw[graph]
    widgets[frame, button, dialog, LineEdit]
  end
  subgraph readdata[read-data]
    getData
    file
    dataUtility
    sharedSingleton
    readEZView
  end
  subgraph calculations
    Calculations
  end
  subgraph thirdparty[third party]
    PyQt5
    pyqtgraph
    pandas
    numpy
    watchdog
  end
  main ==> mainUI
  main ==> uiElements
  main ==> readdata
  main ==> calculations
  worker --> sharedSingleton
  worker --> dataUtility
  plotAllThread --> sharedSingleton
  plotAllThread --> dataUtility
  newFileNotifierThread --> sharedSingleton
  newFileNotifierThread --> watchdog
  curve --> sharedSingleton
  curve --> pyqtgraph
  graphw --> pyqtgraph
  widgets --> PyQt5
  getData --> file
  getData --> dataUtility
  getData --> sharedSingleton
  file --> pandas
  file --> sharedSingleton
  readEZView --> pandas
  readEZView --> numpy
  worker --> PyQt5
  plotAllThread --> PyQt5
  newFileNotifierThread --> PyQt5
  m4[module4/application/main.py] --> pandas
  m4 --> numpy
  m4 --> tkinter
```

Figure 6.1 Import graph for one viewer instance plus module 4. `Calculations` imports only the standard library, which is why it is the one module with tests. Everything else funnels into `sharedSingleton`.

## 7. Program flow

### 7.1 Application state

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Folder_Selected : select_folder / select_ezview
  Folder_Selected --> Running : Start
  Running --> Out_Of_Data : reader returns False
  Out_Of_Data --> Running : delayedRestart or Start
  Folder_Selected --> Out_Of_Data : Plot All
  Idle --> Out_Of_Data : Plot All (state set with no guard)
  Running --> Out_Of_Data : Plot All
  Running --> Running : Pause or Resume toggles pauseBit
  Running --> Idle : Stop confirmed, clearApplication
  Out_Of_Data --> Idle : Stop confirmed, clearApplication
  Folder_Selected --> Idle : Stop confirmed, clearApplication
```

Figure 7.1 Values of `application_state` and the slots that change them.

### 7.2 Worker tick

```mermaid
flowchart TD
  a([QTimer timeout]) --> b{pauseBit false<br/>and startBit true?}
  b -- no --> z([return])
  b -- yes --> c{lastDataPoint empty?}
  c -- yes --> d[dp = dataObj.__next__]
  d --> e{dp valid?}
  e -- no --> f[timer.stop<br/>stopwatch.pause<br/>emit plotEndBit, finished] --> z
  e -- yes --> g[lastDataPoint = dp<br/>anchorTime = dp.x on first]
  c -- no --> h
  g --> h[t = stopwatch.get_elapsed_time]
  h --> i{"lastDataPoint.x·1000 + delay<br/>≤ t + anchorTime?"}
  i -- no --> j{batch non-empty?}
  i -- yes --> k[dp = __next__]
  k --> l{valid?}
  l -- no --> f
  l -- yes --> m[batch.append lastDataPoint<br/>lastDataPoint = dp] --> i
  j -- yes --> n[emit newDataPointSignal batch] --> z
  j -- no --> z
```

Figure 7.2 `Worker.getNextPoint`. The loop releases every frame whose recorded time has already passed on the stopwatch.

### 7.3 Measurement workflow (module 1)

```mermaid
flowchart TD
  a[Import folder] --> b[Start or Plot All]
  b --> c[Bars: place window on stable segment]
  c --> d[Enter temperature]
  d --> e[O2 zero and O2 cal buttons]
  e --> f[CO2 cal 0/6/12/18 µL buttons]
  f --> g[BiCarb cal 0/2/4/6 µL buttons]
  g --> h[Blank]
  h --> i[Extract]
  i --> j[Add to table]
  j --> k{more samples?}
  k -- yes --> c
  k -- no --> l[Purge table → TableData.csv]
  l --> m[Stop → save calibrations?]
```

Figure 7.3 The order the panel expects. Each cal button reads the current window; Extract refuses to run until Blank and the calibrations exist.

## 8. High-level design graph

```mermaid
flowchart TB
  subgraph inst[Instrument side]
    ms1[Primary MS<br/>LabVIEW]
    ms2[Secondary MS<br/>EZView]
    conv[Spool converter<br/>module 4 or read_from_ezview]
    folder[(Acquisition folder<br/>k.csv frames)]
  end
  subgraph core[Shared core, identical in modules 1 to 3]
    reader[Folder reader + watcher]
    replay[Replay engine]
    shared[(SharedSingleton)]
    plots[Plot widgets]
    calc[Calculations]
    shell[Window shell]
  end
  subgraph heads[Variant heads]
    m1[Module 1<br/>respiration: vO, vC, conc]
    m2[Module 2<br/>µbar CO2 and O2]
    m3[Module 3<br/>atom%49 tracer]
  end
  out[(Documents CSVs)]
  ms1 --> folder
  ms2 --> conv --> folder
  folder --> reader --> replay --> shell
  reader --> shared
  shell --> shared
  shared --> plots
  shared --> calc
  shell --> plots
  shell --> calc
  shell --> out
  m1 -. specialises .-> shell
  m2 -. specialises .-> shell
  m3 -. specialises .-> shell
  m3 -. adds atom49 .-> calc
  m2 -. adds µbar .-> calc
```

Figure 8.1 The heads are not separate code units; they are the parts of `main.py` and `Calculations.py` that differ between the three copies.

## 9. Onboarding views

### 9.1 Use cases

```mermaid
flowchart LR
  sci([Bench scientist])
  op([Instrument operator])
  dev([Maintainer])
  subgraph viewer[Acquisition viewer]
    u1(Import folder or spool)
    u2(Start, pause, plot all)
    u3(Place measurement window)
    u4(Calibrate O2 and CO2)
    u5(Measure blank and extract)
    u6(Add to table, export CSV)
    u7(Load or save calibrations)
  end
  subgraph m4[Spool converter]
    u8(Convert spool to CSV frames)
  end
  subgraph maint[Maintenance]
    u9(Build exe with PyInstaller)
    u10(Run calculation tests)
  end
  sci --> u1 & u2 & u3 & u4 & u5 & u6 & u7
  op --> u8
  dev --> u9 & u10
```

### 9.2 Deployment

```mermaid
flowchart LR
  subgraph devbox[Developer machine]
    src[moduleN/application] --> pi[pyinstaller main.spec] --> exe[dist/main.exe]
  end
  subgraph lab[Lab workstation, Windows]
    run[main.exe]
    acq[(../Acquisitions/)]
    docs[(C:/Users/login/Documents/<br/>Calibrations, TableData, RawData)]
    excel[Excel]
  end
  subgraph mspc[Spectrometer PCs]
    lv[LabVIEW acquisition]
    ez[EZView spool]
    m4[module 4 main.exe]
  end
  exe -. copy .-> run
  lv --> acq
  ez --> m4 --> acq
  acq --> run --> docs --> excel
```

### 9.3 Repository map

```
cousins-lab-tools/
├── README.md                        run instructions, pip install per module
├── documentation/                   reports, minutes, sprint reports (no code)
├── module1/
│   ├── application/
│   │   ├── mainUI/main.py           LabView window, 2,452 lines
│   │   ├── mainUI/{worker,plotAllThread,newFileNotifierThread,stopwatch}.py
│   │   ├── read-data/{getData,file,dataUtility,sharedSingleton,readEZView}.py
│   │   ├── uiElements/{curve,graph,frame,button,dialog,LineEdit}.py
│   │   ├── calculations/Calculations.py
│   │   ├── ui/*.ui                  Qt Designer files, bundled, not loaded
│   │   ├── main.spec                PyInstaller
│   │   └── requirements.txt
│   └── testing/calculationTest.py   unittest: calibration, slope, intercept
├── module2/application/…            copy of module1 plus µbar calculations
├── module3/
│   ├── application/…                copy of module1 plus atom49 calculations
│   ├── main.py                      stale merged variant, do not edit
│   └── testing/Acquisition 4336 Mockup.xlsx
├── module4/application/main.py      141-line spool to CSV script
└── module{2,3,4}/SampleData.zip     sample acquisition folders
```

### 9.4 Glossary

Glossary

| Term | Meaning |
| --- | --- |
| frame | One acquisition tick: a timestamp and eight channel voltages; one CSV file |
| m32 … m49 | Mass-to-charge channels. m32 is O2; m44–m49 are CO2 isotopologues used for tracer work |
| mean bars | Two-handle region on the raw plot; every reading is a statistic over frames inside it |
| zero | Mean mV of a channel with no analyte; subtracted before scaling |
| calibration | Scale from mV to physical units, from known injections (µL CO2) or O2 solubility at a temperature |
| blank / extract | Slope of m44 and m32 over the window without and with the sample; the difference is net consumption |
| vO, vC | O2 and CO2 velocities: net rate × calibration, sign flipped so consumption is positive |
| µbar | Partial pressure unit used by module 2: %CO2 × 9200 |
| atom%49 | Module 3 tracer ratio 100 · m49 / (m45 + m47 + m49), plotted as ln so the rate is a slope |
| Plot All | Drain every remaining frame at once instead of replaying at recorded speed |

### 9.5 Risk register

Risk register

| Sev | Issue | Location | Effect |
| --- | --- | --- | --- |
| High | Three near-identical copies of the viewer; fixes must be applied three times | `module{1,2,3}/application` | Already diverged: frame height, Calculations signatures, curve store |
| High | Cubic sign flipped in O2 air solubility | module3 `calculateO2Air` | Wrong O2 calibration in module 3 |
| High | fileList appended from the watchdog thread and read from the QThread with no lock | `NewFileHandler`, `GetData.__next__` | Possible missed or reordered frame |
| Med | Output paths hard-coded to Windows Documents; raw export path missing a separator | `saveCalibrations`, `tableFileSave`, `exportRawData` | Non-Windows fails; raw export lands at Documents\\RawData\<folder>Data.csv |
| Med | Several methods defined twice in main.py; the later one wins | module1 `main.py` | Edits to the first copy have no effect |
| Med | `application_state == "Out_Of_Data"` comparison instead of assignment | `plotAllThread.py` | No-op; caller sets state so it works by accident |
| Med | getMean walks keys until one exceeds xright; if xright ≥ last key it raises IndexError | `Calculations.getMean` | Reachable whenever the right bar is at or beyond the last plotted point, since snapping can land on the last key |
| Med | Plot All sets state to Out_Of_Data unconditionally, after starting the thread that checks for Idle | module1 `plotAllButtonPressed` | Race on the Idle check; Start then allowed with no folder selected |
| Low | Only Calculations has tests | `testing/` | Reader and pacing regressions go unnoticed |
| Low | Debug prints in the per-frame path | module2 `update_main_plot_data` | Console noise |
| Low | Stale `module3/main.py` at module root | `module3/main.py` | Easy to edit the wrong file |
