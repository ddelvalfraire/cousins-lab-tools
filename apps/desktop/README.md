# Tauri + React + TypeScript

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
