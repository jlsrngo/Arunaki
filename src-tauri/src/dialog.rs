//! Arunaki Native Desktop Dialog Module (Pure Rust)
//!
//! Provides native Windows dialogs for folder picking, file selection,
//! and Windows Explorer reveals without relying on Electron or browser APIs.

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Opens the native Windows folder picker dialog.
/// Runs in a background blocking task with CREATE_NO_WINDOW so no console flashes.
#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(windows)]
        {
            let script = include_str!("../../scripts/pick-folder.ps1");
            let mut cmd = std::process::Command::new("powershell");
            cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"]);
            cmd.stdin(std::process::Stdio::piped());
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn folder picker: {}", e))?;
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(script.as_bytes());
            }

            let output = child.wait_with_output().map_err(|e| format!("Failed to run folder picker: {}", e))?;
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Ok(None)
            } else {
                Ok(Some(path))
            }
        }
        #[cfg(not(windows))]
        {
            Ok(None)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens the native Windows file picker dialog.
#[tauri::command]
pub async fn pick_file(filter: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let filter_str = filter.unwrap_or_else(|| "All Files (*.*)|*.*".to_string());
            let script = format!(
                r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "{}"
$dialog.RestoreDirectory = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialog.FileName
}}
"#,
                filter_str
            );
            let mut cmd = std::process::Command::new("powershell");
            cmd.args(["-NoProfile", "-Command", &script]);
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            let output = cmd.output().map_err(|e| format!("Failed to open file dialog: {}", e))?;
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Ok(None)
            } else {
                Ok(Some(path))
            }
        }
        #[cfg(not(windows))]
        {
            Ok(None)
        }
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
