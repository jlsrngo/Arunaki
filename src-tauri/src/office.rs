//! Arunaki Native Office COM Companion Module (Pure Rust)
//!
//! Provides direct Win32 COM automation for Microsoft Excel, Word, and PowerPoint,
//! enabling users to view and control documents in genuine desktop Office windows.

/// Launches Microsoft Excel desktop window for the specified file path or active workbook.
#[tauri::command]
pub async fn open_excel_native(path: Option<String>) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let params = arunaki_docs::com::ExcelComParams {
            action: "open".to_string(),
            file_path: path.clone(),
            sheet_name: None,
            cell: None,
            value: None,
            cells: vec![],
            bold: None,
            italic: None,
            font_size: None,
            bg_color: None,
            alignment: None,
            source_sheet: None,
            new_sheet_name: None,
        };
        let script = arunaki_docs::com::build_excel_com_script(&params);
        let out = arunaki_docs::com::run_powershell_script("excel-open", &script)?;
        Ok(serde_json::json!({
            "success": true,
            "message": if out.is_empty() { "Microsoft Excel opened successfully." } else { &out },
            "path": path
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Launches Microsoft Word desktop window for the specified file path.
#[tauri::command]
pub async fn open_word_native(path: Option<String>) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let params = arunaki_docs::com::WordComParams {
            action: "open".to_string(),
            file_path: path.clone(),
            text: None,
            paragraph_index: None,
            find_text: None,
            replace_text: None,
            bold: None,
            font_size: None,
            alignment: None,
        };
        let script = arunaki_docs::com::build_word_com_script(&params);
        let out = arunaki_docs::com::run_powershell_script("word-open", &script)?;
        Ok(serde_json::json!({
            "success": true,
            "message": if out.is_empty() { "Microsoft Word opened successfully." } else { &out },
            "path": path
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Launches Microsoft PowerPoint desktop window for the specified file path.
#[tauri::command]
pub async fn open_ppt_native(path: Option<String>) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let params = arunaki_docs::com::PptComParams {
            action: "open".to_string(),
            file_path: path.clone(),
            slide_number: None,
            shape_index: None,
            shape_name: None,
            text: None,
            title: None,
            layout: None,
        };
        let script = arunaki_docs::com::build_ppt_com_script(&params);
        let out = arunaki_docs::com::run_powershell_script("ppt-open", &script)?;
        Ok(serde_json::json!({
            "success": true,
            "message": if out.is_empty() { "Microsoft PowerPoint opened successfully." } else { &out },
            "path": path
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Detects whether Microsoft Office COM applications are installed and available.
#[tauri::command]
pub fn check_office_support() -> serde_json::Value {
    #[cfg(windows)]
    {
        let check_reg = |prog_id: &str| -> bool {
            let script = format!(
                r#"try {{ $obj = New-Object -ComObject {}; if ($obj) {{ [System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj) | Out-Null; $true }} else {{ $false }} }} catch {{ $false }}"#,
                prog_id
            );
            arunaki_docs::com::run_powershell_script("check-office", &script)
                .map(|s| s.trim() == "True")
                .unwrap_or(false)
        };
        serde_json::json!({
            "excel": check_reg("Excel.Application"),
            "word": check_reg("Word.Application"),
            "powerpoint": check_reg("PowerPoint.Application"),
            "platform": "windows-com"
        })
    }
    #[cfg(not(windows))]
    {
        serde_json::json!({
            "excel": false,
            "word": false,
            "powerpoint": false,
            "platform": "non-windows"
        })
    }
}
