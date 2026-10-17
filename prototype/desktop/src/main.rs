#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;

use cousinslab::api::{ApiError, Engine, ErrorKind};
use cousinslab::templates::Paths;
use serde_json::Value;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// Runs one engine command. The engine blocks on files and DuckDB, so it runs off the async
/// runtime's threads and the window stays responsive.
#[tauri::command(rename_all = "snake_case")]
async fn api(
    engine: State<'_, Arc<Engine>>,
    command: String,
    args: Value,
) -> Result<Value, ApiError> {
    let engine = Arc::clone(&engine);
    tauri::async_runtime::spawn_blocking(move || engine.call(&command, args))
        .await
        .map_err(|e| ApiError {
            kind: ErrorKind::Internal,
            message: e.to_string(),
        })?
}

/// Shows an exported file in Explorer. Only files inside the data directory can be revealed.
#[tauri::command(rename_all = "snake_case")]
fn show_in_folder(
    app: tauri::AppHandle,
    engine: State<'_, Arc<Engine>>,
    path: PathBuf,
) -> Result<(), ApiError> {
    if !engine.owns_path(&path) {
        return Err(ApiError {
            kind: ErrorKind::Invalid,
            message: format!("{} is not in the data folder", path.display()),
        });
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| ApiError {
            kind: ErrorKind::Internal,
            message: e.to_string(),
        })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = match std::env::var_os("COUSINSLAB_DATA") {
                Some(dir) => PathBuf::from(dir),
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&data_dir)?;
            let engine = Engine::open(Paths::default(), &data_dir).map_err(|e| e.message)?;
            app.manage(Arc::new(engine));

            // wry sets WebView2's browser arguments itself, which overrides the environment
            // variable, so the remote-debugging port used for verification is passed on here.
            let mut args =
                String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
            if let Ok(extra) = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
                args.push(' ');
                args.push_str(&extra);
            }
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Cousins Lab")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .additional_browser_args(&args)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![api, show_in_folder])
        .run(tauri::generate_context!())
        .expect("error while running the Cousins Lab app");
}
