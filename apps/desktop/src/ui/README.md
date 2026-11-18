# DVDash components

Run `bun run storybook` from `apps/desktop`. This uses Storybook's standard component sidebar, Canvas, Docs, Controls, Actions and component-test panel.

## Story conventions

- Colocate `Component.stories.tsx` with each component family. Use `component`, `satisfies Meta<typeof Component>` and `StoryObj<typeof meta>` for prop inference and native Docs/Controls.
- Describe variants with `args`. Only use `render` for a necessary composition or stateful harness. Shared providers/theme/styles belong in `.storybook/preview.tsx`.
- Give examples a realistic containing block with `parameters.previewWidth`: fields/readouts/template cards 360 px, compact forms 480 px, default panels 720 px, charts/tables 960 px, screens `'viewport'` (the application frame fills the canvas, as the app fills its window; narrow screen stories still set a width). The shared story decorator keeps these responsive. Use native `layout: 'centered'` for compact isolated examples, padded for panels and fullscreen for screen compositions. These are example-context limits, not constraints on production components. The composed gallery reads the same parameters. See [Storybook layout parameters](https://storybook.js.org/docs/api/parameters) and [decorators](https://storybook.js.org/docs/writing-stories/decorators).
- Pass deterministic data from `fixtures.ts` through args. For example, SignalChart's default data is empty; its stories supply sample rows. TemplateLibrary receives its fixture catalog as a prop.
- Mock action boundaries with `fn()` from `storybook/test`, passed through args. Save/start/stop/retry spies never contact a catalog or instrument. These are intent callbacks, not proof of a committed revision or physical operation.
- Put interaction checks in `play`, using `within`, `userEvent` and `expect` from `storybook/test`. The Vitest addon runs the actual stories in Chromium. Storybook 10.3+ provisions project annotations automatically; there is no duplicate setup provider.
- MSW is appropriate for real HTTP boundaries. This Tauri app has no HTTP data API, so no fictitious REST endpoints or service worker are introduced. Future IPC/provider contracts should be injected and mocked at their actual boundary.
- `catalog.tsx` composes component stories with Storybook's `composeStories`. Full pages live in the Screens section, rather than being repeated inside All components. The gallery consumes the component stories; it does not define another catalog of props or states. It is excluded from native component tests because those already run its constituent stories. Browser checks cover the gallery itself.

## Open-source precedents

- [Mantine preview](https://github.com/mantinedev/mantine/blob/master/.storybook/preview.tsx): global theme/provider setup and appearance toolbar.
- [Mantine Button stories](https://github.com/mantinedev/mantine/blob/master/packages/@mantine/core/src/components/Button/Button.story.tsx): colocated component variants and focused state examples.
- [Grafana Button stories](https://github.com/grafana/grafana/blob/main/packages/grafana-ui/src/components/Button/Button.story.tsx): real component metadata, editable argTypes and example compositions.
- [Storybook interaction tests](https://storybook.js.org/docs/writing-tests/interaction-testing), [provider mocking](https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-providers) and [Vitest integration](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon): typed CSF, action spies and browser-based play tests.

These are architecture references, not copied upstream implementations. The patterns match Mantine at `f2bc7373a4ffc69cf8af7b6577391f782d4e038c` and Grafana at `01f74f769f0e047658e9927dfe1e7c33bdd73900`; the links above track their current source.

## Local and remote access

Loopback: `bun run storybook --host 127.0.0.1` opens `http://127.0.0.1:6006/`.

- [Component stories](http://127.0.0.1:6006/?path=/story/components-readout--recorded)
- [All components](http://127.0.0.1:6006/?path=/story/gallery-all-components--all-components)
- [Experiments home](http://127.0.0.1:6006/?path=/story/screens-experiments--home)
- [Presets](http://127.0.0.1:6006/?path=/story/screens-presets--catalog)
- [Experiment](http://127.0.0.1:6006/?path=/story/screens-experiment--recorded)

To reach Storybook from another machine, bind it to that network's address and allow the hostname you will browse with. Host validation stays on.

```sh
STORYBOOK_ALLOWED_HOSTS=<hostname> bun run storybook --host <address> --ci
```

## Verification

```sh
bun run check
bun run storybook:check
bun run storybook:build
bun run storybook:test     # Storybook's native Vitest/browser tests, including play
bun run storybook:e2e      # supplementary integration/accessibility/layout checks
```

Install Chromium once with `bunx playwright install chromium`, or select an existing browser using `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. To run integration checks against a Storybook that is already running, set `STORYBOOK_URL` to its address, for example `STORYBOOK_URL=http://127.0.0.1:6141`. Run the integration suite serially; Playwright owns its output directory. Accessibility checks are bounded automated checks, not full screen-reader/localization/performance certification. Native component tests also run the a11y addon; the browser panel is available on demand.

## Scope and identity

### V1 screen inventory

The application opens on **Experiments**. The Screens section holds full-page, navigable stories for each screen below, built from the `feat/acquisition-ui-prototype` workflow. Layouts and navigation follow the approved screen mockups in `design/dvdash-field-review/`.

| Screen               | Responsibility                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Experiments (home)   | Recent experiments and recordings, reopen work, start an experiment.                                                                             |
| Presets              | Browse and preview reusable layouts, edit them, browse and restore revisions, import presets.                                                    |
| New experiment       | Choose a preset, bind instrument roles/data sources, resolve missing requirements.                                                               |
| Experiment workspace | Charts/readouts/tables, intervals, calibration readings, saved results, problems and supported instrument controls; shared live/recorded layout. |
| Routines             | Browse and edit generic routines, inspect their settings, select a routine for an experiment.                                                    |
| Instruments          | Browse instruments and their available channels.                                                                                                 |
| Settings             | Appearance, number display, recording location, export defaults and build details.                                                               |

Revision history is a preset page; saved results, alignment and source bindings are right-sidebar inspectors; recording and preset import and recording export are dialogs. The preset editor resizes panels, and routine steps reorder by drag or keyboard. Dragging panels to rearrange a dashboard is not built.

Readout cards use the shared neutral card border in both appearances, with no decorative top stripe; state belongs in the existing severity banner.

The sidebar has its own stories: expanded/collapsed, selected utility, long labels and a compact-window drawer. Screens reuse that component, and its design is approved.

`PageHeader` has its own collection, detail, tabbed and long-title stories; all screens reuse it. The screen, navigation and header designs are approved.

### Identity and implementation boundaries

The visual direction is GREEN FIELD: forest/jade/mint/lime/ivory, independent scientific series colors and severity colors. The header displays a conceptual crop of `design/dvdash-field-review/identity-review.png`, not a production icon export. Exact vector geometry, licensed type selection and small-size exports remain pending. No optional leaf terminal, domain or tagline is adopted.

The mockups in `design/dvdash-field-review/` set component structure, and GREEN FIELD supplies the theme. Ambit-specific work is excluded and belongs to another owner. Generic routine controls remain shared UI abstractions. Rebinding, live inspection and recovery remain open product questions.

No actual IPC, catalog persistence, acquisition or scientific calculation service is implemented. Scientific arithmetic and results in the prototype panels remain illustrative. Screen compositions are fixture scenarios, not migrated production workflows. The native starter is unchanged. UI modules do not import Tauri invoke/listen; data-provider/service contracts remain separate work.

Source: `components/`, `screens/`, `Screens.tsx`, `theme.ts`, `dvdash.css`; public exports: `index.ts`. Consumers use `MantineProvider` with `dvdashTheme`, the Mantine/uPlot styles and a `.dvdash` root. Build outputs and test reports are ignored.
