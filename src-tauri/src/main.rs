// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let _ = std::fs::write("arunaki-crash.log", format!("CRASH PANIC: {}\n", info));
    }));
    arunaki_desktop_lib::run();
}
