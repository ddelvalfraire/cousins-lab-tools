# Run the Cousins Lab demo on your Mac

## Open the app

1. Open Downloads, then **Cousins Lab Demo**.
2. Double-click **Cousins Lab Acquisition.app**. The **Start demo.command** launcher opens the same app.
3. Confirm that the Home page opens and lists experiment templates.

The app includes its templates and recordings. It needs no instruments, internet connection, Rust, or Python to run.
Your sessions and exports are saved under `~/Library/Application Support/edu.wsu.cousinslab.acquisition/`.
Quit with Command-Q. Reopen the app to continue with the saved sessions.

If macOS blocks this local build, open **System Settings > Privacy & Security**, then choose **Open Anyway** for Cousins Lab Acquisition.

## Rehearse a five-minute presentation

### 1. Explain the goal

Say: "This prototype brings mass spectrometer and fluorometer data into one workflow. Experiment templates define the instruments, calculations, and screen layout. Today's inputs are simulated or replayed recordings."

### 2. Start a grouped run

1. Open **Experiment templates**.
2. Open **Leaf disc CO2 drawdown with PSII fluorescence**.
3. Show the two instrument roles in **Setup**.
4. Choose **Start run with r1**, or the current revision if you have edited it.
5. Choose **20x** and leave **Start** set to **Together**.
6. Start the run. The capture page shows CO2 and fluorescence charts.
7. Open the capture status button in the header. Show the two inputs and their growing row counts.
8. Let the charts fill for about 20 seconds.
9. Press **Mark: Closed system**.
10. Press **Stop run** and confirm.

Say: "One run owns both captures. The app records requested starts, actual start commands, first samples, and operator events separately."

### 3. Review and export

1. Use the floating replay bar to play and seek through the stopped recording.
2. Choose **Review & export**.
3. Open **Align & compare** and select **Clock time** for this simulated run.
4. Open **Export** and export the aligned data.
5. Use **Show in folder** to reveal the CSV and its JSON metadata file.

Say: "Review uses the saved data. The export preserves the original time columns and records its alignment, units, and source hashes."

### 4. Show that templates control the screen

1. Return to the same experiment template.
2. Untick **Include** for the light instrument and save a new revision.
3. Start a run from that revision at **20x**.
4. Show that the fluorescence chart disappears while CO2 remains.
5. Stop the run.
6. Re-enable the light instrument and save so the template is ready for another demonstration.

Say: "The same screen adapts to the experiment configuration. Older sessions keep the template revision they recorded with."

## Show the newer start controls

If you have another minute, start another run and choose **By hand**. Tick the Ambit instrument, then start the run.
Show that CO2 begins while the Ambit waits. Press its **Start** button in the run controls, then show both captures recording.
Stop the run afterward. **Stagger** is the other option and shows a countdown for each delayed start.

## Try the analysis preset after the main demo

1. Open **Sessions**, then **Import recordings**.
2. Select the **JII leaf-disc** preset that offers Gas, Fluorescence, and Together views.
3. Use the mass spec workbook and the pl1 Ambit CSV from **Sample recordings**. Leave pl2 out for this single-plant example.
4. Import the files and open the recording's **Gas** view.
5. Use the pencil controls to enter the injection readings: 0.3111, 0.6912, 1.0681, and 1.4005 mV for 0, 1, 2, and 3 microlitres.
6. Enter a CO2 zero of 0.303 mV and a temperature of 25 degrees Celsius.
7. Set **Reference** to **Elapsed since each start**.
8. Choose a **Custom** window from 01:01:40 to 01:02:20, then select the range from 3713 to 3725 seconds on the chart.
9. Take the **Net uptake** reading. The result is about 18.81 microbar per second.

Use the full prototype guide's **JII leaf-disc preset** section for the remaining readings and the shared-event alignment steps.
Rehearse this section separately before adding it to your presentation.

## Prepare for tomorrow

1. Run through the main demo once and keep that completed session as a backup.
2. Quit and reopen the app to confirm that your session persists.
3. Export one run in advance and keep its CSV available in Finder.
4. Plug in the MacBook and turn off notifications before presenting.

If a live run fails during the presentation, open your completed session, replay it, and show the export.
Describe the current limits plainly: instrument hardware and serial timing have not been verified, and several scientific constants still need lab confirmation.

## Rebuild locally

The source archive and Git bundle supplied with this demo preserve the local work without a push or pull request.
With Rust 1.90 or later and Xcode command line tools installed, run this from the source checkout:

```bash
bash prototype/scripts/build-macos-demo.sh
```

The first build compiles DuckDB and can take 15 minutes or more. Rebuilding is unnecessary for the presentation.
