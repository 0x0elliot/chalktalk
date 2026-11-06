#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, ShortcutState};
use xcap::image::{imageops, RgbaImage};

const HOTKEY: &str = "ctrl+alt+c";
const VOICE_HOTKEY: &str = "ctrl+alt+v";
const ASK_HOTKEY: &str = "ctrl+alt+a";

struct Tray {
    icon: TrayIcon,
    voice: MenuItem<tauri::Wry>,
}

fn config_path() -> PathBuf {
    screens_dir().parent().map(|p| p.join("config.json")).unwrap_or_else(|| PathBuf::from("config.json"))
}

fn read_config() -> Value {
    std::fs::read_to_string(config_path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| json!({}))
}

fn current_voice() -> String {
    read_config()["voice"].as_str().unwrap_or("kokoro").to_string()
}

fn voice_name(voice: &str) -> &'static str {
    if voice == "elevenlabs" { "ElevenLabs" } else { "Kokoro" }
}

fn voice_label(voice: &str) -> String {
    let key = if cfg!(target_os = "macos") { "⌃⌥V" } else { "Ctrl+Alt+V" };
    format!("Voice: {}  ({key} switches)", voice_name(voice))
}

fn switch_voice(app: &AppHandle) {
    let mut config = read_config();
    if !config.is_object() {
        config = json!({});
    }
    let next = if config["voice"].as_str() == Some("elevenlabs") { "kokoro" } else { "elevenlabs" };
    config["voice"] = json!(next);
    let path = config_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(&path, serde_json::to_string_pretty(&config).unwrap_or_default());
    let name = voice_name(next);
    if let Some(tray) = app.try_state::<Tray>() {
        let _ = tray.voice.set_text(voice_label(next));
        let _ = tray.icon.set_tooltip(Some(format!("Chalktalk · voice: {name}")));
        #[cfg(target_os = "macos")]
        {
            let _ = tray.icon.set_title(Some(format!("Voice: {name}")));
            let handle = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(2500));
                if let Some(tray) = handle.try_state::<Tray>() {
                    let _ = tray.icon.set_title(None::<String>);
                }
            });
        }
    }
    if app.state::<Overlay>().showing.load(Ordering::SeqCst) {
        if let Some(window) = overlay(app) {
            let _ = window.eval(&format!(
                "(() => {{ const d = document.createElement('div'); d.textContent = 'Voice: {name}. New answers use it.'; d.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:999px;background:#2c2c2a;color:#fff;font:14px system-ui,sans-serif;z-index:2147483647;box-shadow:0 8px 24px #0004;pointer-events:none'; document.body.append(d); setTimeout(() => d.remove(), 2200); }})()"
            ));
        }
    }
}
const KEPT_FILES: usize = 40;

struct Capture {
    image: Option<RgbaImage>,
    logical_width: f64,
    logical_height: f64,
    monitor_origin: PhysicalPosition<i32>,
    scale: f64,
    app: String,
    window: String,
}

#[derive(Default)]
struct Overlay {
    showing: AtomicBool,
    capture: Mutex<Option<Capture>>,
}

#[derive(Deserialize)]
struct Area {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

fn screens_dir() -> PathBuf {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".chalktalk").join("screens")
}

fn overlay(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("overlay")
}

fn monitor_under(window: &WebviewWindow, cursor: PhysicalPosition<f64>) -> Option<Monitor> {
    let monitors = window.available_monitors().ok()?;
    monitors
        .iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            cursor.x >= p.x as f64 && cursor.y >= p.y as f64 && cursor.x < (p.x + s.width as i32) as f64 && cursor.y < (p.y + s.height as i32) as f64
        })
        .cloned()
        .or_else(|| window.primary_monitor().ok().flatten())
}

fn grab_screen(monitor: &Monitor) -> Option<RgbaImage> {
    let p = monitor.position();
    let scale = monitor.scale_factor();
    let all = xcap::Monitor::all().ok()?;
    let same = |m: &xcap::Monitor| {
        let (x, y) = (m.x().unwrap_or(i32::MIN), m.y().unwrap_or(i32::MIN));
        (x == p.x && y == p.y) || ((x as f64 * scale).round() as i32 == p.x && (y as f64 * scale).round() as i32 == p.y)
    };
    let chosen = all.iter().find(|m| same(m)).or_else(|| all.iter().find(|m| m.is_primary().unwrap_or(false)))?;
    chosen.capture_image().ok()
}

fn frontmost_window() -> (String, String) {
    let ours = std::process::id();
    let windows = xcap::Window::all().unwrap_or_default();
    let candidates: Vec<&xcap::Window> = windows
        .iter()
        .filter(|w| w.pid().map(|p| p != ours).unwrap_or(true) && !w.is_minimized().unwrap_or(false) && w.width().unwrap_or(0) > 0)
        .collect();
    let pick = candidates
        .iter()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| candidates.iter().min_by_key(|w| w.z().unwrap_or(i32::MAX)));
    match pick {
        Some(w) => (w.app_name().unwrap_or_default(), w.title().unwrap_or_default()),
        None => (String::new(), String::new()),
    }
}

fn show(app: &AppHandle, mode: &str) {
    let Some(window) = overlay(app) else { return };
    let state = app.state::<Overlay>();
    let cursor = window.cursor_position().unwrap_or(PhysicalPosition::new(0.0, 0.0));
    let Some(monitor) = monitor_under(&window, cursor) else { return };
    let (app_name, window_title) = frontmost_window();
    let image = grab_screen(&monitor);
    let scale = monitor.scale_factor();
    *state.capture.lock().unwrap() = Some(Capture {
        image,
        logical_width: monitor.size().width as f64 / scale,
        logical_height: monitor.size().height as f64 / scale,
        monitor_origin: *monitor.position(),
        scale,
        app: app_name,
        window: window_title,
    });
    let _ = window.set_position(*monitor.position());
    let _ = window.set_size(*monitor.size());
    let _ = window.set_ignore_cursor_events(false);
    let _ = window.show();
    let _ = window.set_focus();
    state.showing.store(true, Ordering::SeqCst);
    let area = monitor.work_area();
    let (mp, ms) = (monitor.position(), monitor.size());
    let top = (area.position.y - mp.y).max(0) as f64 / scale;
    let left = (area.position.x - mp.x).max(0) as f64 / scale;
    let bottom = ((mp.y + ms.height as i32) - (area.position.y + area.size.height as i32)).max(0) as f64 / scale;
    let right = ((mp.x + ms.width as i32) - (area.position.x + area.size.width as i32)).max(0) as f64 / scale;
    let _ = window.eval(&format!(
        "window.__chalktalkSafe = {{ top: {top:.0}, right: {right:.0}, bottom: {bottom:.0}, left: {left:.0} }}; window.__chalktalkMode = {mode:?}; window.__chalktalkStart && window.__chalktalkStart()"
    ));
}

fn hide(app: &AppHandle) {
    let Some(window) = overlay(app) else { return };
    app.state::<Overlay>().showing.store(false, Ordering::SeqCst);
    let _ = window.hide();
    let _ = window.eval("location.reload()");
}

fn toggle(app: &AppHandle) {
    toggle_mode(app, "draw");
}

fn toggle_mode(app: &AppHandle, mode: &str) {
    if app.state::<Overlay>().showing.load(Ordering::SeqCst) {
        hide(app);
    } else {
        show(app, mode);
    }
}

fn save(image: &RgbaImage, name: &str) -> Option<String> {
    let dir = screens_dir();
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(name);
    image.save(&path).ok()?;
    Some(path.to_string_lossy().into_owned())
}

fn prune() {
    let Ok(entries) = std::fs::read_dir(screens_dir()) else { return };
    let mut files: Vec<(PathBuf, SystemTime)> = entries
        .flatten()
        .filter_map(|e| Some((e.path(), e.metadata().ok()?.modified().ok()?)))
        .collect();
    files.sort_by(|a, b| b.1.cmp(&a.1));
    for (path, _) in files.into_iter().skip(KEPT_FILES) {
        let _ = std::fs::remove_file(path);
    }
}

#[tauri::command]
fn capture(window: WebviewWindow, state: tauri::State<Overlay>, area: Option<Area>) -> Value {
    let guard = state.capture.lock().unwrap();
    let Some(cap) = guard.as_ref() else { return json!(null) };
    let (off_x, off_y) = match window.outer_position() {
        Ok(p) => ((p.x - cap.monitor_origin.x) as f64 / cap.scale, (p.y - cap.monitor_origin.y) as f64 / cap.scale),
        Err(_) => (0.0, 0.0),
    };
    let mut result = json!({
        "app": cap.app,
        "window": cap.window,
        "platform": std::env::consts::OS,
        "screenSize": { "w": cap.logical_width.round(), "h": cap.logical_height.round() },
        "windowOffset": { "x": off_x.round(), "y": off_y.round() },
        "screenRecording": cap.image.is_some(),
    });
    let Some(image) = cap.image.as_ref() else { return result };
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    if let Some(path) = save(image, &format!("{stamp}-screen.png")) {
        result["screenshot"] = json!(path);
    }
    if let Some(area) = area {
        let ratio = image.width() as f64 / cap.logical_width;
        let x0 = (area.x + off_x - 40.0).max(0.0);
        let y0 = (area.y + off_y - 40.0).max(0.0);
        let x1 = (area.x + off_x + area.w + 40.0).min(cap.logical_width);
        let y1 = (area.y + off_y + area.h + 40.0).min(cap.logical_height);
        if x1 > x0 && y1 > y0 {
            let crop = imageops::crop_imm(image, (x0 * ratio) as u32, (y0 * ratio) as u32, ((x1 - x0) * ratio) as u32, ((y1 - y0) * ratio) as u32).to_image();
            if let Some(path) = save(&crop, &format!("{stamp}-circle.png")) {
                result["crop"] = json!(path);
                result["cropOrigin"] = json!({ "x": (x0 - off_x).round(), "y": (y0 - off_y).round() });
            }
        }
    }
    prune();
    result
}

#[tauri::command]
fn done(app: AppHandle) {
    hide(&app);
}

#[tauri::command]
fn set_hit(window: WebviewWindow, hit: bool) {
    let _ = window.set_ignore_cursor_events(!hit);
}

fn follow_cursor(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(33));
        if !app.state::<Overlay>().showing.load(Ordering::SeqCst) {
            continue;
        }
        let Some(window) = overlay(&app) else { continue };
        let (Ok(cursor), Ok(origin), Ok(scale)) = (window.cursor_position(), window.outer_position(), window.scale_factor()) else { continue };
        let x = (cursor.x - origin.x as f64) / scale;
        let y = (cursor.y - origin.y as f64) / scale;
        let _ = window.eval(&format!("window.__chalktalkHit && window.__chalktalkHit({x:.1}, {y:.1})"));
    });
}

fn main() {
    tauri::Builder::default()
        .manage(Overlay::default())
        .invoke_handler(tauri::generate_handler![capture, done, set_hit])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html".into()))
                .title("Chalktalk")
                .transparent(true)
                .decorations(false)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible_on_all_workspaces(true)
                .visible(false)
                .build()?;

            let label = if cfg!(target_os = "macos") { "Explain something  ⌃⌥C" } else { "Explain something  Ctrl+Alt+C" };
            let explain = MenuItemBuilder::with_id("explain", label).build(app)?;
            let ask_label = if cfg!(target_os = "macos") { "Just ask  ⌃⌥A" } else { "Just ask  Ctrl+Alt+A" };
            let ask = MenuItemBuilder::with_id("ask", ask_label).build(app)?;
            let voice = MenuItemBuilder::with_id("voice", voice_label(&current_voice())).build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Chalktalk").build(app)?;
            let menu = MenuBuilder::new(app).item(&explain).item(&ask).item(&voice).separator().item(&quit).build()?;
            let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("Chalktalk");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            let tray = tray
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "explain" => toggle(app),
                    "ask" => toggle_mode(app, "ask"),
                    "voice" => switch_voice(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            app.manage(Tray { icon: tray, voice });

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        if shortcut.key == Code::KeyV {
                            switch_voice(app);
                        } else if shortcut.key == Code::KeyA {
                            toggle_mode(app, "ask");
                        } else {
                            toggle(app);
                        }
                    })
                    .build(),
            )?;
            app.global_shortcut().register(HOTKEY)?;
            app.global_shortcut().register(VOICE_HOTKEY)?;
            app.global_shortcut().register(ASK_HOTKEY)?;

            follow_cursor(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("chalktalk failed to start");
}
