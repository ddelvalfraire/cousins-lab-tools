# Cousins Lab Tools desktop

Tauri 2 hosts a React and TypeScript interface built with Vite. This is the
replacement application's starter, with one `greet` command to exercise IPC.
Instrument acquisition, calculations, and file conversion are not implemented.

## Setup

Use Node.js 26.12.1, pinned in `.nvmrc`, npm 12.2.1, stable Rust, and the
[Tauri prerequisites for your OS](https://v2.tauri.app/start/prerequisites/).
Linux requires native GTK/WebKit libraries; macOS requires Xcode command-line
tools; Windows requires the Microsoft C++ build tools and WebView2.

The scaffold uses the latest stable Node Current release rather than the older
LTS release. Tauri recommends LTS but does not require Node 24. Rust 1.99.1 is the
verified toolchain; `Cargo.toml` records a minimum supported Rust version of 1.90.
The `packageManager` field records npm 12.2.1; it does not install npm for you.

Run these commands from `apps/desktop`:

```sh
npm ci
npm run tauri dev
```

Enter a name and select **Check native connection**. A greeting from Rust
confirms that the native command is connected.

For UI development without Rust, use `npm run dev`. The connection check will
explain that a native window is required. This browser mode does not validate IPC.

## Verification and packaging

```sh
npm run check
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
npm run tauri -- build --debug --no-bundle
npm run tauri build
```

The first two commands need only Node.js. Cargo checks and native packaging also
need the OS prerequisites. `npm run build` builds the frontend only.
The debug command builds a native executable without creating installers. Run
that executable and submit the connection form to verify the React-to-Rust call.
Commit both `package-lock.json` and `src-tauri/Cargo.lock` when dependencies change.

## Code boundaries

- `src/` owns React presentation and interaction.
- `src-tauri/src/` owns native commands and future Rust processing logic.
- `src-tauri/tauri.conf.json` configures the native app and Vite connection.
- `src-tauri/capabilities/` controls window permissions.

Keep processing independent of the UI and command handlers as features arrive.
Extract a Rust crate only when there is a concrete second consumer. This app
does not import or launch the legacy Python modules.

The app identifier `edu.wsu.cousins.labtools` is provisional. Confirm the publisher
identifier before signing and distributing a release. Generated icons are Tauri
starter assets.
