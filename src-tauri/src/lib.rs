use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[tauri::command]
fn desktop_info() -> serde_json::Value {
    serde_json::json!({
        "runtime": "tauri-v2",
        "engine": "Axum v0.7 + Tokio v1.40",
        "desktop": "Tauri v2 + Microsoft Edge WebView2",
        "docs": "Native Win32 COM Sidecar",
        "os": "Windows_NT x64"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Spawn background Axum engine & Local-CLI bridge on localhost
    let host = "127.0.0.1".to_string();
    let port = 4096;
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create background Tokio runtime for Arunaki Engine");
        rt.block_on(async move {
            let probe_url = format!("http://{}:{}/api/health", host, port);
            let already_up = reqwest::Client::builder()
                .timeout(std::time::Duration::from_millis(400))
                .build()
                .unwrap()
                .get(&probe_url)
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false);

            if !already_up {
                let (listener, _url, actual_port) =
                    arunaki_engine::init_engine_and_bind(&host, port).await;
                arunaki_engine::run_axum_server(listener, actual_port).await;
            } else {
                println!("[arunaki-desktop] Engine already running on port {}, reusing instance.", port);
            }
        });
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![desktop_info])
        .setup(|app| {
            // Setup System Tray Icon with Open & Quit menu items
            let show_i = MenuItem::with_id(app, "show", "Open Arunaki", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Arunaki", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
