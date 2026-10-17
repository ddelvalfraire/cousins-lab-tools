//! Serves the acquisition UI and the engine's command table on 127.0.0.1, so the UI can be
//! driven in an ordinary browser where the Tauri window cannot run. Development only; the app
//! itself has no HTTP server.
//!
//! `cargo run --example dev_server -- --data /tmp/cousinslab-dev --port 8765`

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;

use cousinslab::api::{ApiError, Engine, ErrorKind};
use cousinslab::templates::Paths;
use serde_json::{Value, json};
use tiny_http::{Header, Method, Request, Response, Server};

/// Stands in for Tauri's global API: the UI's `invoke` calls become POSTs to this server.
const BRIDGE: &str = r#"window.__TAURI__ = { core: { invoke: async (command, args) => {
  const response = await fetch(`/invoke/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const body = await response.json();
  if (!response.ok) throw body;
  return body;
} } };
"#;

fn main() {
    let mut data = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../target/dev-data"));
    let mut port = 8765;
    let mut args = std::env::args().skip(1);
    while let Some(flag) = args.next() {
        match (flag.as_str(), args.next()) {
            ("--data", Some(value)) => data = PathBuf::from(value),
            ("--port", Some(value)) => port = value.parse().expect("--port takes a number"),
            _ => panic!("usage: dev_server [--data DIR] [--port N]"),
        }
    }
    fs::create_dir_all(&data).expect("cannot create the data directory");
    let engine = Arc::new(Engine::open(Paths::default(), &data).expect("cannot open the engine"));
    let ui = Path::new(env!("CARGO_MANIFEST_DIR")).join("../acquisition-ui");
    let server = Server::http(("127.0.0.1", port)).expect("cannot bind the port");
    println!("UI on http://127.0.0.1:{port}, data in {}", data.display());
    for request in server.incoming_requests() {
        let engine = engine.clone();
        let ui = ui.clone();
        thread::spawn(move || handle(request, &engine, &ui));
    }
}

fn handle(mut request: Request, engine: &Engine, ui: &Path) {
    let url = request.url().split('?').next().unwrap_or("/").to_string();
    let response = match (request.method(), url.strip_prefix("/invoke/")) {
        (Method::Post, Some(command)) => {
            let mut body = String::new();
            let _ = request.as_reader().read_to_string(&mut body);
            let args: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
            json_reply(invoke(engine, command, args))
        }
        (Method::Get, _) if url == "/__dev_bridge.js" => {
            file_reply(BRIDGE.as_bytes().to_vec(), "text/javascript")
        }
        (Method::Get, _) => static_file(ui, &url),
        _ => Response::from_string("Not found").with_status_code(404),
    };
    let _ = request.respond(response);
}

fn invoke(engine: &Engine, command: &str, args: Value) -> Result<Value, ApiError> {
    match command {
        "api" => {
            let name = args["command"].as_str().unwrap_or_default().to_string();
            engine.call(&name, args.get("args").cloned().unwrap_or(Value::Null))
        }
        "show_in_folder" => Err(ApiError {
            kind: ErrorKind::Invalid,
            message: "Show in folder works only in the desktop app".into(),
        }),
        other => Err(ApiError {
            kind: ErrorKind::NotFound,
            message: format!("No command {other}"),
        }),
    }
}

fn json_reply(result: Result<Value, ApiError>) -> Response<std::io::Cursor<Vec<u8>>> {
    let (status, body) = match result {
        Ok(value) => (200, value),
        Err(error) => (400, json!(error)),
    };
    file_reply(body.to_string().into_bytes(), "application/json").with_status_code(status)
}

fn file_reply(bytes: Vec<u8>, mime: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let header = Header::from_bytes("Content-Type", mime).expect("valid header");
    let no_store = Header::from_bytes("Cache-Control", "no-store").expect("valid header");
    Response::from_data(bytes)
        .with_header(header)
        .with_header(no_store)
}

fn static_file(ui: &Path, url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let relative = url.trim_start_matches('/');
    let relative = if relative.is_empty() {
        "index.html"
    } else {
        relative
    };
    if relative.split('/').any(|part| part == "..") {
        return Response::from_string("Not found").with_status_code(404);
    }
    let Ok(bytes) = fs::read(ui.join(relative)) else {
        return Response::from_string("Not found").with_status_code(404);
    };
    if relative == "index.html" {
        let page = String::from_utf8_lossy(&bytes).replacen(
            "<script",
            "<script src=\"/__dev_bridge.js\"></script>\n    <script",
            1,
        );
        return file_reply(page.into_bytes(), "text/html; charset=utf-8");
    }
    let mime = match Path::new(relative).extension().and_then(|e| e.to_str()) {
        Some("js" | "mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("png") => "image/png",
        Some("ttf") => "font/ttf",
        Some("svg") => "image/svg+xml",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    };
    file_reply(bytes, mime)
}
