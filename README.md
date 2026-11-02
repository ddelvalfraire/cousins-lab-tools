<p align="center" class="brand-icon">
  <img src="design/readme-review/assets/icon.png" alt="" width="72" height="72">
</p>

<h1 align="center">DVDash</h1>

<p align="center">A modular workspace for scientific instruments, data, and analysis.</p>

<p align="center" class="badges">
  <a href="LICENSE.txt"><img src="design/readme-review/assets/badge-license.svg" alt="License: MIT" height="26"></a>
  <a href="https://ddelvalfraire.github.io/cousins-lab-tools/"><img src="design/readme-review/assets/badge-manual.svg" alt="Read the user manual" height="26"></a>
  <a href="https://github.com/ddelvalfraire/cousins-lab-tools/releases/tag/legacy-v0.2.0-rc.2"><img src="design/readme-review/assets/badge-downloads.svg" alt="Download Windows lab tools v0.2.0-rc.2 — release candidate" height="26"></a>
  <a href="https://app.circleci.com/pipelines/circleci/MkkpKyoh5KZcRqbZnqUuPM/QiTPgqsziZ6UeBALmEUhw"><img src="design/readme-review/assets/badge-ci.svg" alt="View CircleCI pipelines" height="26"></a>
</p>

<p align="center">
  <a href="#start-here">Start here</a> ·
  <a href="#a-look-at-the-workspace">Workspace</a> ·
  <a href="#run-locally">Run locally</a> ·
  <a href="#project-map">Project map</a>
</p>

DVDash is a scientific desktop application being developed for the **WSU Cousins Plant Biology Lab**. It brings instrument data, visualization, and analysis into a modular workspace designed to grow with the lab's experiments. The existing mass-spectrometer tools support plant respiration research; the new application aims to bring those workflows and additional instruments into one extensible platform.

## Start here

<table width="100%">
  <thead>
    <tr><th scope="col" align="left" width="400">I want to…</th><th scope="col" align="left" width="1000">Go to</th></tr>
  </thead>
  <tbody>
    <tr><td>Get the existing Windows applications</td><td><a href="https://github.com/ddelvalfraire/cousins-lab-tools/releases/tag/legacy-v0.2.0-rc.2">Module 1 and 2 downloads · release candidate</a></td></tr>
    <tr><td>Learn the lab workflow</td><td><a href="https://ddelvalfraire.github.io/cousins-lab-tools/">Researcher user manual</a></td></tr>
    <tr><td>Try a sample recording</td><td><a href="reference/instruments/mass-spec/README.md">Example datasets</a></td></tr>
    <tr><td>Run the Python tools from source</td><td><a href="apps/legacy/README.md">Legacy setup and launch guide</a></td></tr>
    <tr><td>Develop the native desktop app</td><td><a href="apps/desktop/README.md">Desktop setup</a></td></tr>
    <tr><td>Read project reports and history</td><td><a href="documentation/">Project archive</a></td></tr>
  </tbody>
</table>

## A look at the workspace

![DVDash experiment workspace with sidebar navigation, centered search, experiment context, recorded readouts, signal charts, and capture controls.](design/readme-review/assets/workspace.png)

*Current experiment-workspace design with illustrative data. Instrument workflows are still under development in DVDash.*

## Run locally

### Run the Python tools

[Python setup and launch commands →](apps/legacy/README.md)

### Develop DVDash

Install the prerequisites in the [desktop setup guide](apps/desktop/README.md), then run from the repository root:

```sh
cd apps/desktop
bun install --frozen-lockfile
bun run tauri dev
```

See the [desktop guide](apps/desktop/README.md) for builds and cleanup.

## Project map

```text
apps/
  desktop/       Desktop application in development
  legacy/        Python instrument tools and regression checks
design/          Visual studies and local design reviews
documentation/  Project requirements, reports, and history
reference/      Reference material
```

## Contributing

Choose the relevant app guide above before changing code. Use the [desktop development guide](apps/desktop/README.md) for DVDash and the [legacy regression check](apps/legacy/README.md#regression-check) for the Python tools.

Keep scientific units explicit, preserve original samples when changing display settings, and identify fixture behavior clearly. Submit changes with a description of the behavior and how it was verified.

## Credits and license

Developed for the **WSU Cousins Plant Biology Lab** by successive WSU student teams.

<table width="100%">
  <thead>
    <tr><th scope="col" align="left" width="100">Year</th><th scope="col" align="left" width="180">Team</th><th scope="col" align="left" width="1000">Members</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row" align="left">2026&#8288;–&#8288;27</th><td>PhotosynthLab</td><td><a href="https://github.com/ddelvalfraire">David Del Val</a> · <a href="https://github.com/Inventor4life">Ethan Goode</a> · <a href="https://github.com/MaxUpton">Max Upton</a></td></tr>
    <tr><th scope="row" align="left">2025&#8288;–&#8288;26</th><td>WM Codeworks</td><td>Matthew Heseltine · <a href="https://github.com/SkywalkerWesley">Wesley Skywalker</a></td></tr>
    <tr><th scope="row" align="left">2024&#8288;–&#8288;25</th><td>Linnaea Borealis</td><td><a href="https://github.com/KylerKupp">Kyler Kupp</a> · <a href="https://github.com/MetzgerH">Erik Holtrop</a></td></tr>
    <tr><th scope="row" align="left">2023&#8288;–&#8288;24</th><td>Dracaena</td><td>Brayden Groshong · Jack Leeper · Tomer Zangi</td></tr>
    <tr><th scope="row" align="left">2022&#8288;–&#8288;23</th><td>Data Pirates</td><td>Ritik Agarwal · Zoe Parker</td></tr>
  </tbody>
</table>

With thanks to **Dr. Asaph Cousins**, the **Cousins lab research team**, and project mentor **Parteek Kumar** for their guidance and feedback.

<p align="center">
  <a href="https://github.com/ddelvalfraire/cousins-lab-tools/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=ddelvalfraire/cousins-lab-tools" alt="Contributors to Cousins Lab Tools on GitHub"><br>
    <sub>GitHub contributor history</sub>
  </a>
</p>

<p align="center">
  <a href="LICENSE.txt">MIT License</a> ·
  <a href="https://github.com/ddelvalfraire/cousins-lab-tools/graphs/contributors">Contributor history</a> ·
  <a href="documentation/">Project archive</a>
  · <a href="https://github.com/ddelvalfraire/cousins-lab-tools/issues/new/choose">Report a problem</a>
  · <a href="CITATION.cff">Cite this software</a>
</p>
