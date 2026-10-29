// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
fn set_windows_app_user_model_id() {
    use std::os::windows::ffi::OsStrExt;
    let id: Vec<u16> = std::ffi::OsStr::new("com.arunaki.desktop")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        #[link(name = "shell32")]
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(AppID: *const u16) -> i32;
        }
        let _ = SetCurrentProcessExplicitAppUserModelID(id.as_ptr());
    }
}

fn main() {
    #[cfg(windows)]
    set_windows_app_user_model_id();

    std::panic::set_hook(Box::new(|info| {
        let _ = std::fs::write("arunaki-crash.log", format!("CRASH PANIC: {}\n", info));
    }));
    arunaki_desktop_lib::run();
}
