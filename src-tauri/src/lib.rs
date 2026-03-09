use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;
use base64::engine::{Engine as _, general_purpose::STANDARD as BASE64};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Mutex,
};

/// Managed state that maps each command id → its live MenuItem handle.
/// Stored in Tauri's app state so `set_menu_item_enabled` can reach the
/// actual handles rather than copies returned by `Menu::get`.
struct MenuItems(Mutex<HashMap<String, MenuItem<tauri::Wry>>>);

/// Monotonically increasing counter used to generate unique window labels.
struct WindowCounter(AtomicU32);

/// Pending file paths for newly created windows: window_label → file_path.
/// Set by `new_window`, consumed once by `take_pending_file` on startup.
struct PendingFiles(Mutex<HashMap<String, String>>);

/// Called from JS to enable/disable a menu item by its string id.
#[tauri::command]
fn set_menu_item_enabled(
    app: tauri::AppHandle,
    id: &str,
    enabled: bool,
) -> Result<(), String> {
    let state = app.state::<MenuItems>();
    let map   = state.0.lock().map_err(|e| e.to_string())?;
    let item  = map.get(id).ok_or_else(|| format!("unknown menu item: {id}"))?;
    item.set_enabled(enabled).map_err(|e| e.to_string())
}

/// Opens a native OS file picker filtered to FASTA alignment file types, reads
/// the selected file, and returns `{"name": "...", "content": "...", "path": "..."}` to JS.
/// Returns `null` if the user cancels.
///
/// Must be `async` so Tauri runs it on a worker thread instead of the main
/// thread — blocking_pick_file() blocks its caller, and calling it on the
/// main thread freezes the WebKit event loop.
#[tauri::command]
async fn pick_alignment_file(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let result = app
        .dialog()
        .file()
        .add_filter("FASTA files", &["fasta", "fa", "fna", "ffn", "faa", "frn"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();

    match result {
        None => Ok(None),
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("alignment")
                .to_string();
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let path_str = path.to_string_lossy().to_string();
            Ok(Some(serde_json::json!({ "name": name, "content": content, "path": path_str })))
        }
    }
}

/// Opens a native OS file picker filtered to reference genome file types (JSON / GenBank),
/// reads the selected file, and returns `{"name": "...", "content": "..."}` to JS.
/// Returns `null` if the user cancels.
#[tauri::command]
async fn pick_reference_file(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let result = app
        .dialog()
        .file()
        .add_filter("Reference genome files", &["json", "gb", "gbk", "genbank"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();

    match result {
        None => Ok(None),
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("reference")
                .to_string();
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            Ok(Some(serde_json::json!({ "name": name, "content": content })))
        }
    }
}

/// Shows a native save-file dialog and writes `content` to the chosen path.
///
/// * `filename`   – suggested filename shown in the dialog (e.g. "alignment.fasta")
/// * `content`    – file content as a UTF-8 string **or** a Base64-encoded string
///                  when `base64` is true (used for binary formats such as PNG)
/// * `base64`     – when true, `content` is decoded from Base64 before writing
/// * `filter_name`/ `extensions` – file-type filter shown in the dialog
///
/// Returns `true` if the file was saved, `false` if the user cancelled.
#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    filename: String,
    content: String,
    base64: bool,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<bool, String> {
    let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let result = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter(&filter_name, &ext_refs)
        .blocking_save_file();

    match result {
        None => Ok(false),
        Some(path) => {
            let path = path.into_path().map_err(|e| e.to_string())?;
            if base64 {
                use std::io::Write;
                let bytes = BASE64.decode(content.as_bytes()).map_err(|e| e.to_string())?;
                std::fs::File::create(&path).map_err(|e| e.to_string())?
                    .write_all(&bytes).map_err(|e| e.to_string())?;
            } else {
                std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
            }
            Ok(true)
        }
    }
}

/// Reads a file from the given absolute path and returns its content as a string.
/// Used by the frontend to load a file that was opened via drag-to-icon or a
/// file association double-click (the path is emitted via the "open-file" event).
#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    eprintln!("[read_file_content] Reading file: {}", path);

    std::fs::read_to_string(&path).map_err(|e| {
        let error_msg = format!("Failed to read {}: {}", path, e);
        eprintln!("[read_file_content] {}", error_msg);
        error_msg
    })
}

/// Creates a new Sealion window. If `file_path` is provided the path is stored
/// in PendingFiles keyed by the new window's label; the window's JS retrieves it
/// via `take_pending_file` on startup and loads the alignment automatically.
#[tauri::command]
fn new_window(app: tauri::AppHandle, file_path: Option<String>) -> Result<(), String> {
    let n = app.state::<WindowCounter>().0.fetch_add(1, Ordering::SeqCst);
    let label = format!("window-{n}");

    if let Some(path) = file_path {
        app.state::<PendingFiles>().0.lock().unwrap().insert(label.clone(), path);
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("sealion.html".into()),
    )
    .title("Sealion \u{2014} Genomic Alignment Viewer")
    .inner_size(1600.0, 900.0)
    .min_inner_size(900.0, 600.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Retrieves (and removes) any pending file path for the calling window.
/// Called by the JS adapter on startup to load a file passed to `new_window`.
#[tauri::command]
fn take_pending_file(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Option<String> {
    let label = window.label();
    let result = app.state::<PendingFiles>().0.lock().unwrap().remove(label);

    #[cfg(target_os = "windows")]
    if let Some(ref path) = result {
        eprintln!("[take_pending_file] Window '{}' taking pending file: {}", label, path);
    } else {
        eprintln!("[take_pending_file] Window '{}' has no pending file", label);
    }

    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_menu_item_enabled,
            pick_alignment_file,
            pick_reference_file,
            save_file,
            read_file_content,
            new_window,
            take_pending_file
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Forward any file opened via drag-to-icon or double-click (macOS file
            // association) to the frontend as an "open-file" event with the file path.
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().to_string();
                        let focused = app_handle
                            .webview_windows()
                            .into_values()
                            .find(|w| w.is_focused().unwrap_or(false));
                        if let Some(w) = focused {
                            w.emit("open-file", &path_str).ok();
                        } else {
                            app_handle.state::<PendingFiles>().0.lock().unwrap()
                                .insert("main".to_string(), path_str.clone());
                            app_handle.emit("open-file", &path_str).ok();
                        }
                    }
                }
            });

            // ── Sealion (app menu) ────────────────────────────────────────────
            let app_menu = Submenu::with_items(app, "Sealion", true, &[
                &PredefinedMenuItem::about(app, None, Some(AboutMetadata {
                    name:      Some("Sealion".into()),
                    version:   Some(env!("CARGO_PKG_VERSION").into()),
                    copyright: Some("\u{a9} ARTIC Network".into()),
                    ..Default::default()
                }))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ])?;

            // ── File ──────────────────────────────────────────────────────────
            let new_win        = MenuItem::with_id(app, "new-window",       "New Window",                   true, Some("CmdOrCtrl+N"))?;
            let open_alignment = MenuItem::with_id(app, "open-alignment",   "Open Alignment\u{2026}",       true, Some("CmdOrCtrl+O"))?;
            let load_reference = MenuItem::with_id(app, "load-reference",   "Load Reference Genome\u{2026}", true, Some("CmdOrCtrl+R"))?;
            let export_aln     = MenuItem::with_id(app, "export-alignment", "Export Alignment\u{2026}",     true, Some("CmdOrCtrl+E"))?;

            let file_menu = Submenu::with_items(app, "File", true, &[
                &new_win,
                &PredefinedMenuItem::separator(app)?,
                &open_alignment,
                &load_reference,
                &PredefinedMenuItem::separator(app)?,
                &export_aln,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ])?;

            // ── Edit ──────────────────────────────────────────────────────────
            let edit_menu = Submenu::with_items(app, "Edit", true, &[
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::cut(app, None)?,
                &PredefinedMenuItem::copy(app, None)?,
                &PredefinedMenuItem::paste(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::select_all(app, None)?,
            ])?;

            // ── Alignment ─────────────────────────────────────────────────────
            let find      = MenuItem::with_id(app, "find",      "Find\u{2026}",         true, Some("CmdOrCtrl+F"))?;
            let find_next = MenuItem::with_id(app, "find-next", "Find Next",             true, Some("CmdOrCtrl+G"))?;
            let find_prev = MenuItem::with_id(app, "find-prev", "Find Previous",         true, Some("Shift+CmdOrCtrl+G"))?;
            let next_diff = MenuItem::with_id(app, "next-diff", "Next Difference",       true, Some("CmdOrCtrl+."))?;
            let prev_diff = MenuItem::with_id(app, "prev-diff", "Previous Difference",   true, Some("CmdOrCtrl+,"))?;

            let alignment_menu = Submenu::with_items(app, "Alignment", true, &[
                &find,
                &find_next,
                &find_prev,
                &PredefinedMenuItem::separator(app)?,
                &next_diff,
                &prev_diff,
            ])?;

            // ── View ──────────────────────────────────────────────────────────
            let zoom_in    = MenuItem::with_id(app, "zoom-in",    "Zoom In",    true, Some("CmdOrCtrl+="))?;
            let zoom_out   = MenuItem::with_id(app, "zoom-out",   "Zoom Out",   true, Some("CmdOrCtrl+-"))?;
            let reset_zoom = MenuItem::with_id(app, "reset-zoom", "Reset Zoom", true, Some("CmdOrCtrl+0"))?;

            let view_menu = Submenu::with_items(app, "View", true, &[
                &zoom_in,
                &zoom_out,
                &PredefinedMenuItem::separator(app)?,
                &reset_zoom,
            ])?;

            // ── Window ────────────────────────────────────────────────────────
            let window_menu = Submenu::with_items(app, "Window", true, &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::maximize(app, None)?,
                &PredefinedMenuItem::fullscreen(app, None)?,
            ])?;

            // ── Help ──────────────────────────────────────────────────────────
            let show_help = MenuItem::with_id(app, "show-help", "Sealion Help", true, Some("CmdOrCtrl+?"))?;

            let help_menu = Submenu::with_items(app, "Help", true, &[
                &show_help,
            ])?;

            let menu = Menu::with_items(app, &[
                &app_menu,
                &file_menu,
                &edit_menu,
                &alignment_menu,
                &view_menu,
                &window_menu,
                &help_menu,
            ])?;
            app.set_menu(menu)?;

            // ── Initial disabled states ───────────────────────────────────────
            // Set synchronously in Rust before the WebView loads so the menu
            // reflects the correct state from the very first frame.
            // The JS command registry (sealion-tauri.js) drives all subsequent
            // changes via set_menu_item_enabled invocations.
            for item in &[&export_aln, &next_diff, &prev_diff] {
                item.set_enabled(false)?;
            }

            // ── Register live MenuItem handles in managed state ────────────────
            let mut map: HashMap<String, MenuItem<tauri::Wry>> = HashMap::new();
            for (id, item) in [
                ("new-window",       new_win),
                ("open-alignment",   open_alignment),
                ("load-reference",   load_reference),
                ("export-alignment", export_aln),
                ("find",             find),
                ("find-next",        find_next),
                ("find-prev",        find_prev),
                ("next-diff",        next_diff),
                ("prev-diff",        prev_diff),
                ("zoom-in",          zoom_in),
                ("zoom-out",         zoom_out),
                ("reset-zoom",       reset_zoom),
                ("show-help",        show_help),
            ] {
                map.insert(id.to_string(), item);
            }
            app.manage(MenuItems(Mutex::new(map)));
            app.manage(WindowCounter(AtomicU32::new(0)));
            app.manage(PendingFiles(Mutex::new(HashMap::new())));

            // Check whether the app was launched by opening a file (drag-to-icon,
            // "Open With", double-click). get_current() reads the launch URL
            // synchronously in setup — before the window's JS has a chance to call
            // take_pending_file — so this is the only race-free place to capture it.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                if let Some(url) = urls.into_iter().next() {
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().to_string();
                        app.state::<PendingFiles>().0.lock().unwrap()
                            .insert("main".to_string(), path_str);
                    }
                }
            }

            // Windows file associations launch a fresh process with the file path
            // as the first command-line argument. The deep-link plugin does not
            // intercept this, so we read args() here as a fallback.
            #[cfg(target_os = "windows")]
            {
                let pending_state = app.state::<PendingFiles>();
                let mut pending = pending_state.0.lock().unwrap();
                if !pending.contains_key("main") {
                    if let Some(arg) = std::env::args().nth(1) {
                        let path = std::path::Path::new(&arg);
                        if path.is_file() {
                            if let Ok(canonical) = path.canonicalize() {
                                if let Some(path_str) = canonical.to_str() {
                                    eprintln!("[Windows] Storing pending file: {}", path_str);
                                    pending.insert("main".to_string(), path_str.to_string());
                                }
                            }
                        }
                    }
                }
            }

            // Forward every menu event to the focused window as a "menu-event".
            app.on_menu_event(|app, event| {
                let id = event.id().as_ref().to_string();
                let focused = app
                    .webview_windows()
                    .into_values()
                    .find(|w| w.is_focused().unwrap_or(false));
                if let Some(w) = focused {
                    w.emit("menu-event", &id).ok();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sealion");
}
