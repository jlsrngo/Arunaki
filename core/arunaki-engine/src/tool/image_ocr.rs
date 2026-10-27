//! Native High-Speed Image OCR Tool using Windows Runtime OCR.
//! Mirrors OCR capability for receipts, invoices, and table scans.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use super::resolve_isolated_path;
use crate::paths::arunaki_dot_dir;

pub fn image_ocr_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "image_ocr",
            "description": include_str!("prompt/image_ocr.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "file": {
                        "type": "string",
                        "description": "Relative path to image file inside workspace or scratch directory."
                    }
                },
                "required": ["file"]
            }
        }
    })
}

/// Runs Windows Media OCR on any image file path.
pub fn run_native_ocr(image_path: &Path) -> Result<String, String> {
    if !image_path.exists() {
        return Err(format!("Image file not found: {}", image_path.display()));
    }
    let abs_path = match image_path.canonicalize() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => image_path.to_string_lossy().to_string(),
    };
    let clean_path = abs_path.trim_start_matches(r"\\?\").replace('\'', "''");

    let ps_code = format!(
        r#"Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]
Function Await($t, $r) {{
    $asTask = $asTaskGeneric.MakeGenericMethod($r)
    $netTask = $asTask.Invoke($null, @($t))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}}
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$imagePath = '{clean_path}'
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {{
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
}}
$ocrResult = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output $ocrResult.Text
"#
    );

    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &ps_code]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().map_err(|e| format!("Failed to spawn powershell OCR: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR error: {}", stderr));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(stdout)
}

pub fn execute_image_ocr(workspace_dir: &str, arguments: &Value) -> Value {
    let file_param = arguments
        .get("file")
        .or_else(|| arguments.get("filePath"))
        .or_else(|| arguments.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if file_param.is_empty() {
        return json!({ "error": "Missing required 'file' parameter for image_ocr" });
    }

    // Check workspace first, then .arunaki/scratch
    let target_path: PathBuf = if let Ok(p) = resolve_isolated_path(workspace_dir, file_param) {
        p
    } else {
        let scratch_candidate = arunaki_dot_dir().join("scratch").join(file_param);
        if scratch_candidate.exists() {
            scratch_candidate
        } else {
            Path::new(workspace_dir).join(file_param)
        }
    };

    if !target_path.exists() {
        return json!({ "error": format!("Image file not found: '{}'", file_param) });
    }

    match run_native_ocr(&target_path) {
        Ok(text) => {
            let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
            json!({
                "success": true,
                "file": file_param,
                "text": text,
                "lineCount": lines.len()
            })
        }
        Err(err) => json!({ "error": err }),
    }
}
