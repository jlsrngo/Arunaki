//! Arunaki Native Desktop Dialog Module (Pure Rust)
//!
//! Provides native Windows dialogs for folder picking, file selection,
//! and Windows Explorer reveals without relying on Electron or browser APIs.

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Opens the native Windows folder picker dialog (Modern Windows File Explorer).
#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let picked = rfd::FileDialog::new()
            .set_title("Select Active Project Folder")
            .pick_folder();
        Ok(picked.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens the native Windows file picker dialog (Modern Windows File Explorer).
#[tauri::command]
pub async fn pick_file(filter: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new().set_title("Select File");
        if let Some(f) = filter {
            let exts: Vec<&str> = f
                .split('|')
                .nth(1)
                .unwrap_or("*.*")
                .split(';')
                .map(|s| s.trim().trim_start_matches("*."))
                .filter(|s| !s.is_empty() && *s != "*")
                .collect();
            if !exts.is_empty() {
                dialog = dialog.add_filter("Files", &exts);
            }
        }
        let picked = dialog.pick_file();
        Ok(picked.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Reveals a file or folder in Windows Explorer with selection.
#[tauri::command]
pub fn show_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer");
        cmd.args(["/select,", &path]);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    Ok(())
}

/// Opens a file or URL with the default system application.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/c", "start", "", &path]);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    Ok(())
}
