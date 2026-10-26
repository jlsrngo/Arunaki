use arunaki_engine::*;
use std::time::Duration;

#[cfg(windows)]
fn attach_console_if_present() {
    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(dw_process_id: u32) -> i32;
    }
    unsafe {
        let _ = AttachConsole(0xFFFFFFFF);
    }
}

#[cfg(not(windows))]
fn attach_console_if_present() {}

fn main() {
    attach_console_if_present();

    let exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().to_lowercase()))
        .unwrap_or_default();
    let is_engine = exe_name.contains("engine");

    let args: Vec<String> = std::env::args().collect();
    let mut port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4096);
    let mut hostname = String::from("127.0.0.1");
    // Engine binary defaults to headless/server mode (never opens WebView2 GUI)
    let mut headless = is_engine;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "serve" | "--headless" | "--server" => {
                headless = true;
                i += 1;
            }
            "gui" | "--gui" | "--ui" => {
                headless = false;
                i += 1;
            }
            "--port" | "-p" if i + 1 < args.len() => {
                if let Ok(p) = args[i + 1].parse::<u16>() {
                    port = p;
                }
                i += 2;
            }
            "--hostname" | "-h" if i + 1 < args.len() => {
                hostname = args[i + 1].clone();
                i += 2;
            }
            "--version" | "-v" => {
                println!("arunaki-engine {}", ENGINE_VERSION);
                return;
            }
            _ => {
                i += 1;
            }
        }
    }

    if headless || std::env::var("ARUNAKI_HEADLESS").as_deref() == Ok("1") {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime");
        rt.block_on(async move {
            println!("================================================================");
            println!("       ARUNAKI ENGINE - Native AI & Daemon Server (v{})         ", ENGINE_VERSION);
            println!("================================================================");
            let (listener, _url, actual_port) = init_engine_and_bind(&hostname, port).await;
            println!(" [Engine]  Axum API Engine listening on http://{}:{}", hostname, actual_port);
            println!(" [Bridge]  Local-CLI Bridge on http://127.0.0.1:20188/v1");
            println!(" [Status]  Headless Engine Daemon Active (No Web UI Window)");
            println!("----------------------------------------------------------------");
            println!(" Live AI Activity & Telemetry Logs (Press Ctrl+C to stop):");
            println!("================================================================");
            use std::io::Write;
            let _ = std::io::stdout().flush();
            run_axum_server(listener, actual_port).await;
        });
    } else {
        // Standalone Desktop GUI Mode
        if std::env::var("ARUNAKI_HIDE_CONSOLE").as_deref() == Ok("1") {
            desktop::hide_console_window();
        } else {
            println!("================================================================");
            println!("          ARUNAKI - Desktop Document AI Agent (v{})           ", ENGINE_VERSION);
            println!("================================================================");
            println!(" [Engine]  Axum Engine running on http://{}:{}", hostname, port);
            println!(" [Bridge]  Local-CLI Bridge on http://127.0.0.1:20188/v1");
            println!(" [UI Mode] Native Windows WebView2 Desktop Active");
            println!("----------------------------------------------------------------");
            println!(" Live AI Activity & Telemetry Logs:");
            println!("================================================================");
            use std::io::Write;
            let _ = std::io::stdout().flush();
        }

        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<String>();
        let host_clone = hostname.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("Failed to create background Tokio runtime");
            rt.block_on(async move {
                // Check if another arunaki-engine is already listening on `port`
                let probe_url = format!("http://{}:{}/api/health", host_clone, port);
                let already_up = reqwest::Client::builder()
                    .timeout(Duration::from_millis(400))
                    .build()
                    .unwrap()
                    .get(&probe_url)
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false);

                if already_up {
                    let existing_url = format!("http://{}:{}", host_clone, port);
                    let _ = ready_tx.send(existing_url);
                    loop {
                        tokio::time::sleep(Duration::from_secs(3600)).await;
                    }
                } else {
                    let (listener, url, actual_port) =
                        init_engine_and_bind(&host_clone, port).await;
                    let _ = ready_tx.send(url);
                    run_axum_server(listener, actual_port).await;
                }
            });
        });

        let app_url = ready_rx
            .recv_timeout(Duration::from_secs(10))
            .unwrap_or_else(|_| format!("http://{}:{}", hostname, port));
        desktop::launch_desktop_window(&app_url);
    }
}
