# Tauri + React + TypeScript

The local [DVDash component catalog](src/README.md) runs with `bun run storybook` from this directory. It uses Mantine and uPlot independently of the native starter. Browse native component stories or open `http://127.0.0.1:6006/?path=/story/gallery-all-components--all-components`.

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), Node.js 26.12.1 (selected by `.nvmrc`), and Bun 1.4.4. Rust and Cargo are required for the native app.

From the repository root:

```sh
cd apps/desktop
bun install --frozen-lockfile
bun run tauri dev
```

Check types and build the application:

```sh
bun run check
bun run tauri build
```

Run the front-end tests:

```sh
bun run test
```

Commit `bun.lock` when dependencies change. Bun uses the existing `package.json` and TypeScript configuration, so no `bunfig.toml` is required.

## Remove project dependencies and builds

Stop the development server and any builds, then run from `apps/desktop`:

```sh
bun run clean
```

From the repository root, use:

```sh
bun run --cwd apps/desktop clean
```

This removes only this desktop project's `node_modules`, `dist`, `dist-ssr`, `src-tauri/target` (including app and DMG bundles), and `tsconfig.node.tsbuildinfo`. Paths are anchored to this project even when the script runs from another directory. The command also works when those outputs are already absent.

Source files, lockfiles, toolchains, and shared caches stay in place. Run `bun install --frozen-lockfile` before developing again; the next native build recompiles Rust dependencies.

## Lint and format

`bun run check` also runs these:

```sh
bun run storybook:check    # type-checks .storybook/, tests/ and the Vitest and Playwright configs
bun run lint               # Biome lint and format check
bun run lint:fixtures      # proves the effect ban, as biome.json configures it, rejects every file in lint/fixtures
bun run lint:boundaries    # proves the import boundary rules reject every file in lint/boundaries/fixtures
bun run lint:suppressions  # fails on a biome-ignore, nested Biome config or biome.json setting that switches off the effect ban or the boundary rules
```

`bun run format` rewrites files with Biome's formatting. See [the UI README](src/README.md#verification) for the rules they enforce and [its layout section](src/README.md#layout) for how the source is organised.
