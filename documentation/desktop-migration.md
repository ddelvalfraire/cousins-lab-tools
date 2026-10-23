# Desktop migration layout

Keep the legacy application and its replacement in one repository with independent
builds and dependency environments.

## Application ownership

- `apps/legacy/` contains the four Python modules and their regression tests after
  the legacy relocation in PR #35.
- `apps/desktop/src/` contains the React and TypeScript interface.
- `apps/desktop/src-tauri/` contains the Rust host and native configuration.
- `documentation/` and `reference/` retain their existing locations.

The legacy app has one final planned feature. New feature development then focuses
on the desktop app. The desktop app targets Windows, macOS, and Linux.

## Build boundaries

Use npm for the frontend and Tauri CLI, Cargo for Rust, and separate Python
environments for the legacy modules. Commit the desktop app's npm and Cargo
lockfiles. No monorepo task framework or shared processing package is required by
this starter.

The new app launches independently of Python. React owns presentation and
interaction; Rust command handlers connect it to native behavior. As processing
features arrive, keep calculations separate from UI and command adapters and
compare results with representative legacy outputs before replacing workflows.

Whether to reuse Python processing temporarily remains a separate architecture
decision. This starter establishes only the React-to-Rust connection.

## Development and verification

See [desktop setup and checks](../apps/desktop/README.md). Native build and runtime
verification is platform-specific. Passing a browser build does not establish
native IPC, and passing a Linux native check does not verify Windows or macOS.
Cross-platform CI is a separate planned change.

The scaffold uses the official
[Tauri React/TypeScript generator](https://v2.tauri.app/start/create-project/).
