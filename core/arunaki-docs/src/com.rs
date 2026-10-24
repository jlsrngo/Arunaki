use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn ps_escape(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn run_powershell_script(prefix: &str, script: &str) -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut tmp_path: PathBuf = std::env::temp_dir();
    tmp_path.push(format!("arunaki-{}-{}-{}.ps1", prefix, std::process::id(), nanos));
    fs::write(&tmp_path, script).map_err(|e| e.to_string())?;

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        tmp_path.to_string_lossy().as_ref(),
    ]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output();

    let _ = fs::remove_file(&tmp_path);

    let out = output.map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !stderr.is_empty() && stdout.is_empty() {
        return Err(stderr);
    }
    Ok(stdout)
}

pub struct ExcelComParams {
    pub action: String,
    pub file_path: Option<String>,
    pub sheet_name: Option<String>,
    pub cell: Option<String>,
    pub value: Option<String>,
    pub cells: Vec<(String, String)>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub font_size: Option<f64>,
    pub bg_color: Option<i64>,
    pub alignment: Option<String>,
    pub source_sheet: Option<String>,
    pub new_sheet_name: Option<String>,
}

pub fn build_excel_com_script(p: &ExcelComParams) -> String {
    let mut actions = vec![
        "$ErrorActionPreference = 'Stop'".to_string(),
        "$excel = $null".to_string(),
        "$excelWasOpen = $false".to_string(),
        "try {".to_string(),
        "  $excel = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')".to_string(),
        "  $excelWasOpen = $true".to_string(),
        "} catch {".to_string(),
        "  try {".to_string(),
        "    $excel = New-Object -ComObject Excel.Application".to_string(),
        "    $excelWasOpen = $false".to_string(),
        "  } catch {".to_string(),
        "    Write-Output \"ERROR: Microsoft Excel COM automation is not available\"".to_string(),
        "    exit".to_string(),
        "  }".to_string(),
        "}".to_string(),
        "$excel.DisplayAlerts = $false".to_string(),
    ];

    if p.action == "open" {
        actions.push("$excel.Visible = $true".to_string());
    } else {
        actions.push("if (-not $excelWasOpen) { $excel.Visible = $false }".to_string());
    }

    actions.push("$wb = $null".to_string());
    actions.push("$wbWasAlreadyOpen = $false".to_string());

    if let Some(fp) = &p.file_path {
        let escaped_fp = ps_escape(fp);
        actions.push(format!("$targetPath = [System.IO.Path]::GetFullPath('{}')", escaped_fp));
        actions.push("try {".to_string());
        actions.push("  foreach ($w in $excel.Workbooks) {".to_string());
        actions.push("    if ($w.FullName -ieq $targetPath) {".to_string());
        actions.push("      $wb = $w".to_string());
        actions.push("      $wbWasAlreadyOpen = $true".to_string());
        actions.push("      break".to_string());
        actions.push("    }".to_string());
        actions.push("  }".to_string());
        actions.push("  if (-not $wb) {".to_string());
        actions.push("    if (Test-Path $targetPath) {".to_string());
        actions.push("      $wb = $excel.Workbooks.Open($targetPath)".to_string());
        actions.push("    } else {".to_string());
        actions.push("      $wb = $excel.Workbooks.Add()".to_string());
        actions.push("      $wb.SaveAs($targetPath)".to_string());
        actions.push("    }".to_string());
        actions.push("  }".to_string());
        actions.push("} catch {".to_string());
        actions.push("  Write-Output \"ERROR: Failed to open workbook: $($_.Exception.Message)\"".to_string());
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    } else {
        actions.push("try {".to_string());
        actions.push("  $wb = $excel.ActiveWorkbook".to_string());
        actions.push("  if (-not $wb) {".to_string());
        actions.push("    Write-Output \"ERROR: No active workbook found\"".to_string());
        actions.push("    exit".to_string());
        actions.push("  }".to_string());
        actions.push("  $wbWasAlreadyOpen = $true".to_string());
        actions.push("} catch {".to_string());
        actions.push("  Write-Output \"ERROR: Failed to access active workbook: $($_.Exception.Message)\"".to_string());
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    }

    actions.push("$ws = $null".to_string());
    if let Some(sn) = &p.sheet_name {
        let escaped_sn = ps_escape(sn);
        actions.push("try {".to_string());
        actions.push(format!("  $ws = $wb.Sheets.Item('{}')", escaped_sn));
        actions.push("  $ws.Activate()".to_string());
        actions.push("} catch {".to_string());
        actions.push(format!("  Write-Output \"ERROR: Worksheet '{}' not found\"", escaped_sn));
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    } else {
        actions.push("try {".to_string());
        actions.push("  $ws = $wb.ActiveSheet".to_string());
        actions.push("  if (-not $ws) {".to_string());
        actions.push("    $ws = $wb.Sheets.Item(1)".to_string());
        actions.push("    $ws.Activate()".to_string());
        actions.push("  }".to_string());
        actions.push("} catch {".to_string());
        actions.push("  Write-Output \"ERROR: No sheet found in workbook\"".to_string());
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    }

    let cell = p.cell.as_deref().unwrap_or("A1");
    match p.action.as_str() {
        "open" => {
            actions.push("$excel.Visible = $true".to_string());
            actions.push("$excel.DisplayAlerts = $true".to_string());
            actions.push("try { $wb.Activate(); $ws.Activate() } catch {}".to_string());
            actions.push("Write-Output \"OK:open\"".to_string());
        }
        "write" | "write_cell" => {
            let val = p.value.as_deref().unwrap_or("");
            if val.starts_with('=') {
                actions.push(format!("$ws.Range('{}').Formula = '{}'", ps_escape(cell), ps_escape(val)));
            } else {
                actions.push(format!("$ws.Range('{}').Value2 = '{}'", ps_escape(cell), ps_escape(val)));
            }
            if p.bold == Some(true) {
                actions.push(format!("$ws.Range('{}').Font.Bold = $true", ps_escape(cell)));
            } else if p.bold == Some(false) {
                actions.push(format!("$ws.Range('{}').Font.Bold = $false", ps_escape(cell)));
            }
            if p.italic == Some(true) {
                actions.push(format!("$ws.Range('{}').Font.Italic = $true", ps_escape(cell)));
            } else if p.italic == Some(false) {
                actions.push(format!("$ws.Range('{}').Font.Italic = $false", ps_escape(cell)));
            }
            if let Some(fs) = p.font_size {
                actions.push(format!("$ws.Range('{}').Font.Size = {}", ps_escape(cell), fs));
            }
            if let Some(bg) = p.bg_color {
                actions.push(format!("$ws.Range('{}').Interior.Color = {}", ps_escape(cell), bg));
            }
            if let Some(align) = &p.alignment {
                let code = match align.as_str() {
                    "center" => -4108,
                    "right" => -4152,
                    _ => -4131,
                };
                actions.push(format!("$ws.Range('{}').HorizontalAlignment = {}", ps_escape(cell), code));
            }
            actions.push("try { $ws.Calculate() } catch {}".to_string());
            actions.push(format!("Write-Output \"OK:{}:{}\"", p.action, cell));
        }
        "write_range" => {
            for (r, v) in &p.cells {
                if v.starts_with('=') {
                    actions.push(format!("$ws.Range('{}').Formula = '{}'", ps_escape(r), ps_escape(v)));
                } else {
                    actions.push(format!("$ws.Range('{}').Value2 = '{}'", ps_escape(r), ps_escape(v)));
                }
            }
            actions.push("try { $ws.Calculate() } catch {}".to_string());
            actions.push(format!("Write-Output \"OK:write_range:{} cells\"", p.cells.len()));
        }
        "format" | "format_cell" => {
            if let Some(val) = p.value.as_deref() {
                if !val.is_empty() {
                    if val.starts_with('=') {
                        actions.push(format!("$ws.Range('{}').Formula = '{}'", ps_escape(cell), ps_escape(val)));
                    } else {
                        actions.push(format!("$ws.Range('{}').Value2 = '{}'", ps_escape(cell), ps_escape(val)));
                    }
                }
            }
            if p.bold == Some(true) {
                actions.push(format!("$ws.Range('{}').Font.Bold = $true", ps_escape(cell)));
            } else if p.bold == Some(false) {
                actions.push(format!("$ws.Range('{}').Font.Bold = $false", ps_escape(cell)));
            }
            if p.italic == Some(true) {
                actions.push(format!("$ws.Range('{}').Font.Italic = $true", ps_escape(cell)));
            } else if p.italic == Some(false) {
                actions.push(format!("$ws.Range('{}').Font.Italic = $false", ps_escape(cell)));
            }
            if let Some(fs) = p.font_size {
                actions.push(format!("$ws.Range('{}').Font.Size = {}", ps_escape(cell), fs));
            }
            if let Some(bg) = p.bg_color {
                actions.push(format!("$ws.Range('{}').Interior.Color = {}", ps_escape(cell), bg));
            }
            if let Some(align) = &p.alignment {
                let code = match align.as_str() {
                    "center" => -4108,
                    "right" => -4152,
                    _ => -4131,
                };
                actions.push(format!("$ws.Range('{}').HorizontalAlignment = {}", ps_escape(cell), code));
            }
            actions.push(format!("Write-Output \"OK:{}:{}\"", p.action, cell));
        }
        "summary" | "calculate" | "recalculate" => {
            actions.push("try { $excel.CalculateFull() } catch { $excel.Calculate() }".to_string());
            if p.cell.is_some() {
                actions.push(format!(
                    "$cVal = $ws.Range('{}').Text; Write-Output \"OK:summary:{}=$cVal\"",
                    ps_escape(cell),
                    cell
                ));
            } else {
                actions.push("Write-Output \"OK:summary:calculated\"".to_string());
            }
        }
        "clone_sheet" => {
            let src = p.source_sheet.as_deref().unwrap_or("Sheet1");
            actions.push(format!("$srcSheet = $wb.Sheets.Item('{}')", ps_escape(src)));
            actions.push("$srcSheet.Copy([System.Reflection.Missing]::Value, $wb.Sheets.Item($wb.Sheets.Count))".to_string());
            actions.push("$newSheet = $wb.Sheets.Item($wb.Sheets.Count)".to_string());
            if let Some(nn) = &p.new_sheet_name {
                actions.push(format!("$newSheet.Name = '{}'", ps_escape(nn)));
            }
            actions.push(format!(
                "Write-Output \"OK:clone_sheet:{}\"",
                p.new_sheet_name.as_deref().unwrap_or("Copy")
            ));
        }
        "delete_sheet" => {
            let sn = p.sheet_name.as_deref().unwrap_or("Sheet1");
            actions.push(format!("$wb.Sheets.Item('{}').Delete()", ps_escape(sn)));
            actions.push(format!("Write-Output \"OK:delete_sheet:{}\"", sn));
        }
        other => {
            actions.push(format!("Write-Output \"ERROR:unknown action '{}'\"", other));
        }
    }

    if p.action == "open" {
        actions.extend([
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}".to_string(),
        ]);
    } else {
        actions.extend([
            "try { $wb.Save() } catch {}".to_string(),
            "if (-not $wbWasAlreadyOpen) { try { $wb.Close($false) } catch {} }".to_string(),
            "if (-not $excelWasOpen) { try { $excel.Quit() } catch {} }".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}".to_string(),
            "[System.GC]::Collect()".to_string(),
            "[System.GC]::WaitForPendingFinalizers()".to_string(),
        ]);
    }

    actions.join("\n")
}

pub struct WordComParams {
    pub action: String,
    pub file_path: Option<String>,
    pub text: Option<String>,
    pub paragraph_index: Option<usize>,
    pub find_text: Option<String>,
    pub replace_text: Option<String>,
    pub bold: Option<bool>,
    pub font_size: Option<f64>,
    pub alignment: Option<String>,
}

pub fn build_word_com_script(p: &WordComParams) -> String {
    let mut actions = vec![
        "$ErrorActionPreference = 'Stop'".to_string(),
        "$word = $null".to_string(),
        "$wordWasOpen = $false".to_string(),
        "try {".to_string(),
        "  $word = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')".to_string(),
        "  $wordWasOpen = $true".to_string(),
        "} catch {".to_string(),
        "  try {".to_string(),
        "    $word = New-Object -ComObject Word.Application".to_string(),
        "    $wordWasOpen = $false".to_string(),
        "  } catch {".to_string(),
        "    Write-Output \"ERROR: Microsoft Word COM automation is not available\"".to_string(),
        "    exit".to_string(),
        "  }".to_string(),
        "}".to_string(),
        "$word.DisplayAlerts = 0".to_string(),
    ];

    if p.action == "open" {
        actions.push("$word.Visible = $true".to_string());
    } else {
        actions.push("if (-not $wordWasOpen) { $word.Visible = $false }".to_string());
    }

    actions.push("$doc = $null".to_string());
    actions.push("$docWasAlreadyOpen = $false".to_string());

    if let Some(fp) = &p.file_path {
        let escaped_fp = ps_escape(fp);
        actions.push(format!("$targetPath = [System.IO.Path]::GetFullPath('{}')", escaped_fp));
        actions.push("try {".to_string());
        actions.push("  foreach ($d in $word.Documents) {".to_string());
        actions.push("    if ($d.FullName -ieq $targetPath) {".to_string());
        actions.push("      $doc = $d".to_string());
        actions.push("      $docWasAlreadyOpen = $true".to_string());
        actions.push("      break".to_string());
        actions.push("    }".to_string());
        actions.push("  }".to_string());
        actions.push("  if (-not $doc) {".to_string());
        actions.push("    if (Test-Path $targetPath) {".to_string());
        actions.push("      $doc = $word.Documents.Open($targetPath)".to_string());
        actions.push("    } else {".to_string());
        actions.push("      $doc = $word.Documents.Add()".to_string());
        actions.push("      $doc.SaveAs2($targetPath)".to_string());
        actions.push("    }".to_string());
        actions.push("  }".to_string());
        actions.push("} catch {".to_string());
        actions.push("  Write-Output \"ERROR: Failed to open document: $($_.Exception.Message)\"".to_string());
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    } else {
        actions.push("try {".to_string());
        actions.push("  $doc = $word.ActiveDocument".to_string());
        actions.push("  if (-not $doc) {".to_string());
        actions.push("    Write-Output \"ERROR: No active document found\"".to_string());
        actions.push("    exit".to_string());
        actions.push("  }".to_string());
        actions.push("  $docWasAlreadyOpen = $true".to_string());
        actions.push("} catch {".to_string());
        actions.push("  Write-Output \"ERROR: Failed to get active document: $($_.Exception.Message)\"".to_string());
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    }

    match p.action.as_str() {
        "open" => {
            actions.push("$word.Visible = $true".to_string());
            actions.push("$word.DisplayAlerts = -1".to_string());
            actions.push("try { $doc.Activate() } catch {}".to_string());
            actions.push("Write-Output \"OK:open\"".to_string());
        }
        "append" | "write" | "write_text" => {
            let txt = p.text.as_deref().unwrap_or("");
            actions.push(format!("$doc.Content.InsertAfter('{}')", ps_escape(txt)));
            actions.push(format!("Write-Output \"OK:{}\"", p.action));
        }
        "write_at_paragraph" => {
            let idx = p.paragraph_index.unwrap_or(1);
            let txt = p.text.as_deref().unwrap_or("");
            actions.push(format!("$target = $doc.Paragraphs.Item({})", idx));
            actions.push(format!("$target.Range.InsertAfter('{}')", ps_escape(txt)));
            actions.push(format!("Write-Output \"OK:write_at_paragraph:{}\"", idx));
        }
        "replace" | "find_replace" => {
            let f = p.find_text.as_deref().unwrap_or("");
            let r = p.replace_text.as_deref().unwrap_or("");
            actions.push(format!("$find = $doc.Content.Find"));
            actions.push(format!("$find.Text = '{}'", ps_escape(f)));
            actions.push(format!("$find.Replacement.Text = '{}'", ps_escape(r)));
            actions.push("$find.Forward = $true".to_string());
            actions.push("$find.Wrap = 1".to_string());
            actions.push("$find.Execute([System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, [System.Reflection.Missing]::Value, 2)".to_string());
            actions.push(format!("Write-Output \"OK:{}\"", p.action));
        }
        "format" => {
            if p.bold == Some(true) {
                actions.push("$doc.Content.Font.Bold = $true".to_string());
            } else if p.bold == Some(false) {
                actions.push("$doc.Content.Font.Bold = $false".to_string());
            }
            if let Some(fs) = p.font_size {
                actions.push(format!("$doc.Content.Font.Size = {}", fs));
            }
            if let Some(align) = &p.alignment {
                let code = match align.as_str() {
                    "center" => 1,
                    "right" => 2,
                    _ => 0,
                };
                actions.push(format!("$doc.Content.ParagraphFormat.Alignment = {}", code));
            }
            actions.push("Write-Output \"OK:format\"".to_string());
        }
        other => {
            actions.push(format!("Write-Output \"ERROR:unknown action '{}'\"", other));
        }
    }

    if p.action == "open" {
        actions.extend([
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch {}".to_string(),
        ]);
    } else {
        actions.extend([
            "try { $doc.Save() } catch {}".to_string(),
            "if (-not $docWasAlreadyOpen) { try { $doc.Close(0) } catch {} }".to_string(),
            "if (-not $wordWasOpen) { try { $word.Quit() } catch {} }".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch {}".to_string(),
            "[System.GC]::Collect()".to_string(),
            "[System.GC]::WaitForPendingFinalizers()".to_string(),
        ]);
    }

    actions.join("\n")
}

pub struct PptComParams {
    pub action: String,
    pub file_path: Option<String>,
    pub slide_number: Option<usize>,
    pub shape_index: Option<usize>,
    pub shape_name: Option<String>,
    pub text: Option<String>,
    pub title: Option<String>,
    pub layout: Option<usize>,
}

pub fn build_ppt_com_script(p: &PptComParams) -> String {
    let mut actions = vec![
        "$ErrorActionPreference = 'Stop'".to_string(),
        "$ppt = $null".to_string(),
        "$pptWasOpen = $false".to_string(),
        "try {".to_string(),
        "  $ppt = [System.Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')".to_string(),
        "  $pptWasOpen = $true".to_string(),
        "} catch {".to_string(),
        "  try {".to_string(),
        "    $ppt = New-Object -ComObject PowerPoint.Application".to_string(),
        "    $pptWasOpen = $false".to_string(),
        "  } catch {".to_string(),
        "    Write-Output \"ERROR: Microsoft PowerPoint COM automation is not available\"".to_string(),
        "    exit".to_string(),
        "  }".to_string(),
        "}".to_string(),
    ];

    if p.action == "open" {
        actions.push("$ppt.Visible = [Microsoft.Office.Interop.PowerPoint.MsoTriState]::msoTrue".to_string());
    }

    actions.push("$pres = $null".to_string());
    actions.push("$presWasAlreadyOpen = $false".to_string());

    if let Some(fp) = &p.file_path {
        let escaped_fp = ps_escape(fp);
        actions.push(format!("$targetPath = [System.IO.Path]::GetFullPath('{}')", escaped_fp));
        actions.push("try {".to_string());
        actions.push("  foreach ($pr in $ppt.Presentations) {".to_string());
        actions.push("    if ($pr.FullName -ieq $targetPath) {".to_string());
        actions.push("      $pres = $pr".to_string());
        actions.push("      $presWasAlreadyOpen = $true".to_string());
        actions.push("      break".to_string());
        actions.push("    }".to_string());
        actions.push("  }".to_string());
        actions.push("  if (-not $pres) {".to_string());
        actions.push("    if (Test-Path $targetPath) {".to_string());
        actions.push("      $pres = $ppt.Presentations.Open($targetPath)".to_string());
        actions.push("    } else {".to_string());
        actions.push("      $pres = $ppt.Presentations.Add([Microsoft.Office.Interop.PowerPoint.MsoTriState]::msoTrue)".to_string());
        actions.push("      $pres.SaveAs($targetPath)".to_string());
        actions.push("    }".to_string());
        actions.push("  }".to_string());
        actions.push("} catch {".to_string());
        actions.push("  Write-Output \"ERROR: Failed to open presentation: $($_.Exception.Message)\"".to_string());
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    } else {
        actions.push("try {".to_string());
        actions.push("  $pres = $ppt.ActivePresentation".to_string());
        actions.push("  if (-not $pres) {".to_string());
        actions.push("    Write-Output \"ERROR: No active presentation found\"".to_string());
        actions.push("    exit".to_string());
        actions.push("}".to_string());
        actions.push("  $presWasAlreadyOpen = $true".to_string());
        actions.push("} catch {".to_string());
        actions.push("  Write-Output \"ERROR: Failed to access active presentation: $($_.Exception.Message)\"".to_string());
        actions.push("  exit".to_string());
        actions.push("}".to_string());
    }

    match p.action.as_str() {
        "open" => {
            actions.push("$ppt.Visible = [Microsoft.Office.Interop.PowerPoint.MsoTriState]::msoTrue".to_string());
            actions.push("try { $pres.Windows.Item(1).Activate() } catch {}".to_string());
            actions.push("Write-Output \"OK:open\"".to_string());
        }
        "add_slide" => {
            let layout = p.layout.unwrap_or(1);
            actions.push(format!("$layout = $pres.SlideMaster.CustomLayouts.Item({})", layout));
            actions.push("$slide = $pres.Slides.AddSlide($pres.Slides.Count + 1, $layout)".to_string());
            if let Some(t) = &p.title {
                actions.push(format!("$slide.Shapes.Title.TextFrame.TextRange.Text = '{}'", ps_escape(t)));
            }
            if let Some(txt) = &p.text {
                actions.push(format!("$slide.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = '{}'", ps_escape(txt)));
            }
            actions.push("Write-Output \"OK:add_slide:$($pres.Slides.Count)\"".to_string());
        }
        "set_text" | "set_shape_text" => {
            let slide_num = p.slide_number.unwrap_or(1);
            let txt = p.text.as_deref().unwrap_or("");
            actions.push(format!("$slide = $pres.Slides.Item({})", slide_num));
            if let Some(sn) = &p.shape_name {
                actions.push("foreach ($shape In $slide.Shapes) {".to_string());
                actions.push(format!("  if ($shape.Name -eq '{}') {{", ps_escape(sn)));
                actions.push(format!("    $shape.TextFrame.TextRange.Text = '{}'", ps_escape(txt)));
                actions.push(format!("    Write-Output \"OK:{}:{}\"", p.action, sn));
                actions.push("  }".to_string());
                actions.push("}".to_string());
            } else {
                let idx = p.shape_index.unwrap_or(1);
                actions.push(format!("$idx = {}", idx));
                actions.push("$shape = $slide.Shapes.Item($idx)".to_string());
                actions.push(format!("$shape.TextFrame.TextRange.Text = '{}'", ps_escape(txt)));
                actions.push(format!("Write-Output \"OK:{}:shape$($idx)\"", p.action));
            }
        }
        other => {
            actions.push(format!("Write-Output \"ERROR:unknown action '{}'\"", other));
        }
    }

    if p.action == "open" {
        actions.extend([
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null } catch {}".to_string(),
        ]);
    } else {
        actions.extend([
            "try { $pres.Save() } catch {}".to_string(),
            "if (-not $presWasAlreadyOpen) { try { $pres.Close() } catch {} }".to_string(),
            "if (-not $pptWasOpen) { try { $ppt.Quit() } catch {} }".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null } catch {}".to_string(),
            "try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null } catch {}".to_string(),
            "[System.GC]::Collect()".to_string(),
            "[System.GC]::WaitForPendingFinalizers()".to_string(),
        ]);
    }

    actions.join("\n")
}
