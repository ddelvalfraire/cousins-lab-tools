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

| I want to… | Go to |
| --- | --- |
| Get the existing Windows applications | [Module 1 and 2 downloads · release candidate](https://github.com/ddelvalfraire/cousins-lab-tools/releases/tag/legacy-v0.2.0-rc.2) |
| Learn the lab workflow | [Researcher user manual](https://ddelvalfraire.github.io/cousins-lab-tools/) |
| Try a sample recording | [Example datasets](reference/instruments/mass-spec/README.md) |
| Run the Python tools from source | [Legacy setup and launch guide](apps/legacy/README.md) |
| Develop the native desktop app | [Desktop setup](apps/desktop/README.md) |
| Read project reports and history | [Project archive](documentation/) |

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

<table class="contributors" width="100%">
  <tr>
    <td align="center" width="33%"><a href="https://github.com/ddelvalfraire"><img src="design/readme-review/assets/contributors/david-del-val.png" alt="David Del Val" width="64" height="64"><br><strong>David Del Val</strong></a><br><sub>Current</sub></td>
    <td align="center" width="33%"><a href="https://github.com/Inventor4life"><img src="design/readme-review/assets/contributors/ethan-goode.png" alt="Ethan Goode" width="64" height="64"><br><strong>Ethan Goode</strong></a><br><sub>Current</sub></td>
    <td align="center" width="33%"><a href="https://github.com/MaxUpton"><img src="design/readme-review/assets/contributors/max-upton.png" alt="Max Upton" width="64" height="64"><br><strong>Max Upton</strong></a><br><sub>Current</sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><img src="design/readme-review/assets/contributors/matthew-heseltine.svg" alt="Matthew Heseltine initials" width="64" height="64"><br><strong>Matthew Heseltine</strong><br><sub>2025–26</sub></td>
    <td align="center" width="33%"><a href="https://github.com/SkywalkerWesley"><img src="design/readme-review/assets/contributors/wesley-skywalker.png" alt="Wesley Skywalker" width="64" height="64"><br><strong>Wesley Skywalker</strong></a><br><sub>2025–26</sub></td>
    <td align="center" width="33%"><a href="https://github.com/KylerKupp"><img src="design/readme-review/assets/contributors/kyler-kupp.png" alt="Kyler Kupp" width="64" height="64"><br><strong>Kyler Kupp</strong></a><br><sub>2024–25</sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><a href="https://github.com/MetzgerH"><img src="design/readme-review/assets/contributors/erik-holtrop.png" alt="Erik Holtrop" width="64" height="64"><br><strong>Erik Holtrop</strong></a><br><sub>2024–25</sub></td>
    <td align="center" width="33%"><img src="design/readme-review/assets/contributors/brayden-groshong.svg" alt="Brayden Groshong initials" width="64" height="64"><br><strong>Brayden Groshong</strong><br><sub>2023–24</sub></td>
    <td align="center" width="33%"><img src="design/readme-review/assets/contributors/jack-leeper.svg" alt="Jack Leeper initials" width="64" height="64"><br><strong>Jack Leeper</strong><br><sub>2023–24</sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><img src="design/readme-review/assets/contributors/tomer-zangi.svg" alt="Tomer Zangi initials" width="64" height="64"><br><strong>Tomer Zangi</strong><br><sub>2023–24</sub></td>
    <td align="center" width="33%"><img src="design/readme-review/assets/contributors/ritik-agarwal.svg" alt="Ritik Agarwal initials" width="64" height="64"><br><strong>Ritik Agarwal</strong><br><sub>2022–23</sub></td>
    <td align="center" width="33%"><img src="design/readme-review/assets/contributors/zoe-parker.svg" alt="Zoe Parker initials" width="64" height="64"><br><strong>Zoe Parker</strong><br><sub>2022–23</sub></td>
  </tr>
</table>

With thanks to **Dr. Asaph Cousins**, the **Cousins lab research team**, and project mentor **Parteek Kumar** for their guidance and feedback.

<p align="center">
  <a href="LICENSE.txt">MIT License</a> ·
  <a href="https://github.com/ddelvalfraire/cousins-lab-tools/graphs/contributors">Contributor history</a> ·
  <a href="documentation/">Project archive</a>
  · <a href="https://github.com/ddelvalfraire/cousins-lab-tools/issues/new/choose">Report a problem</a>
  · <a href="CITATION.cff">Cite this software</a>
</p>
