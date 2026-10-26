pub mod api;
pub mod dialog;
pub mod fs;
pub mod office;
pub mod system;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

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
        .invoke_handler(tauri::generate_handler![
            // 1. Core API & Window
            api::desktop_info,
            api::window_minimize,
            api::window_toggle_maximize,
            api::window_close,
            api::tauri_engine_fetch,
            api::tauri_cli_login,
            api::tauri_cli_status,
            // 2. Native Dialogs
            dialog::pick_folder,
            dialog::pick_file,
            dialog::show_in_explorer,
            dialog::open_path,
            // 3. Office COM Companion
            office::open_excel_native,
            office::open_word_native,
            office::open_ppt_native,
            office::check_office_support,
            // 4. Safe Project Filesystem
            fs::list_project_files,
            fs::read_project_file,
            fs::write_project_file,
            // 5. System Diagnostics & Telemetry
            system::get_system_telemetry,
            system::detect_cli_binaries,
            system::system_ping
        ])
        .setup(|app| {
            // Bridge engine events to the webview over Tauri IPC, so the UI never needs SSE over
            // the local HTTP port. Third-party clients still use GET /api/event on :4096.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut rx = arunaki_engine::session::get_event_sender().subscribe();
                loop {
                    match rx.recv().await {
                        Ok(event) => {
                            let _ = handle.emit("arunaki-event", event);
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            });

            // Setup System Tray Icon with Open & Quit menu items safely
            if let Ok(show_i) = MenuItem::with_id(app, "show", "Open Arunaki", true, None::<&str>) {
                if let Ok(quit_i) = MenuItem::with_id(app, "quit", "Quit Arunaki", true, None::<&str>) {
                    if let Ok(menu) = Menu::with_items(app, &[&show_i, &quit_i]) {
                        let mut tray_builder = TrayIconBuilder::new()
                            .menu(&menu)
                            .show_menu_on_left_click(false);

                        if let Some(icon) = app.default_window_icon() {
                            tray_builder = tray_builder.icon(icon.clone());
                        }

                        let _ = tray_builder
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
                            .build(app);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
