use axum::{response::IntoResponse, response::Response, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

/// Converts a column letter like "A", "Z", "AA" to 1-based index (A=1, B=2, ..., Z=26, AA=27).
pub fn col_letter_to_index(col: &str) -> Option<usize> {
    let mut index = 0usize;
    for ch in col.to_ascii_uppercase().chars() {
        if !ch.is_ascii_alphabetic() {
            return None;
        }
        index = index.checked_mul(26)?.checked_add((ch as usize) - ('A' as usize) + 1)?;
    }
    if index == 0 {
        None
    } else {
        Some(index)
    }
}

/// Converts a 1-based column index to letter (1 -> "A", 26 -> "Z", 27 -> "AA").
pub fn index_to_col_letter(mut index: usize) -> String {
    let mut s = String::new();
    while index > 0 {
        let rem = (index - 1) % 26;
        s.push((b'A' + rem as u8) as char);
        index = (index - 1) / 26;
    }
    s.chars().rev().collect()
}

/// Parses an A1-style cell reference (e.g. "B14" -> (2, 14)).
pub fn parse_cell_coord(cell: &str) -> Option<(usize, usize)> {
    let trimmed = cell.trim();
    let col_end = trimmed.find(|c: char| c.is_ascii_digit())?;
    let col_str = &trimmed[..col_end];
    let row_str = &trimmed[col_end..];
    let col = col_letter_to_index(col_str)?;
    let row: usize = row_str.parse().ok()?;
    if row == 0 {
        return None;
    }
    Some((col, row))
}

/// Parses a range like "A1:B10" into ((start_col, start_row), (end_col, end_row)).
pub fn parse_cell_range(range_str: &str) -> Option<((usize, usize), (usize, usize))> {
    let parts: Vec<&str> = range_str.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let p1 = parse_cell_coord(parts[0])?;
    let p2 = parse_cell_coord(parts[1])?;
    let min_col = p1.0.min(p2.0);
    let max_col = p1.0.max(p2.0);
    let min_row = p1.1.min(p2.1);
    let max_row = p1.1.max(p2.1);
    Some(((min_col, min_row), (max_col, max_row)))
}

/// Computes range aggregate: SUM, AVERAGE, COUNT, MIN, MAX.
pub fn compute_range_stat(
    func: &str,
    range: ((usize, usize), (usize, usize)),
    grid: &HashMap<(usize, usize), f64>,
) -> f64 {
    let ((min_c, min_r), (max_c, max_r)) = range;
    let mut values = Vec::new();
    for c in min_c..=max_c {
        for r in min_r..=max_r {
            if let Some(&val) = grid.get(&(c, r)) {
                values.push(val);
            }
        }
    }

    match func.to_uppercase().as_str() {
        "SUM" => values.iter().sum(),
        "AVERAGE" | "AVG" => {
            if values.is_empty() {
                0.0
            } else {
                values.iter().sum::<f64>() / values.len() as f64
            }
        }
        "COUNT" => values.len() as f64,
        "MIN" => {
            if values.is_empty() {
                0.0
            } else {
                values.iter().cloned().fold(f64::INFINITY, f64::min)
            }
        }
        "MAX" => {
            if values.is_empty() {
                0.0
            } else {
                values.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
            }
        }
        _ => 0.0,
    }
}

// ---------------------------------------------------------------------------
// Markdown Table & CSV Parsing & Statistics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedTable {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: usize,
    pub total_cols: usize,
    pub column_stats: Vec<ColumnStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnStat {
    pub header: String,
    pub is_numeric: bool,
    pub sum: Option<f64>,
    pub average: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

fn is_table_divider(line: &str) -> bool {
    let trimmed = line.trim();
    if !trimmed.starts_with('|') || !trimmed.ends_with('|') {
        return false;
    }
    let inner = &trimmed[1..trimmed.len() - 1];
    inner
        .split('|')
        .all(|part| part.trim().chars().all(|c| c == '-' || c == ':'))
}

pub fn parse_markdown_table(content: &str) -> Option<ParsedTable> {
    let lines: Vec<&str> = content
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    if lines.len() < 2 {
        return None;
    }

    let mut table_start = None;
    for i in 0..lines.len() - 1 {
        let l1 = lines[i];
        let l2 = lines[i + 1];
        if l1.starts_with('|') && l1.ends_with('|') && l2.starts_with('|') && l2.ends_with('|') && is_table_divider(l2) {
            table_start = Some(i);
            break;
        }
    }

    let start = table_start?;
    let header_line = lines[start];
    let headers: Vec<String> = header_line
        .split('|')
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();

    let mut rows = Vec::new();
    let mut i = start + 2;
    while i < lines.len() && lines[i].starts_with('|') && lines[i].ends_with('|') {
        let row: Vec<String> = lines[i]
            .split('|')
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty())
            .collect();
        if !row.is_empty() {
            rows.push(row);
        }
        i += 1;
    }

    let total_rows = rows.len();
    let total_cols = headers.len();

    let mut column_stats = Vec::new();
    for col_idx in 0..total_cols {
        let mut num_vals = Vec::new();
        for row in &rows {
            if let Some(cell) = row.get(col_idx) {
                let cleaned = cell
                    .replace([',', '$', '€', '£', '¥'], "")
                    .replace("Rp", "")
                    .trim()
                    .to_string();
                if let Ok(num) = cleaned.parse::<f64>() {
                    num_vals.push(num);
                }
            }
        }
        let is_numeric = !num_vals.is_empty() && num_vals.len() >= (total_rows / 2).max(1);
        if is_numeric {
            let sum: f64 = num_vals.iter().sum();
            let avg = sum / num_vals.len() as f64;
            let min = num_vals.iter().cloned().fold(f64::INFINITY, f64::min);
            let max = num_vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            column_stats.push(ColumnStat {
                header: headers.get(col_idx).cloned().unwrap_or_default(),
                is_numeric: true,
                sum: Some(sum),
                average: Some(avg),
                min: Some(min),
                max: Some(max),
            });
        } else {
            column_stats.push(ColumnStat {
                header: headers.get(col_idx).cloned().unwrap_or_default(),
                is_numeric: false,
                sum: None,
                average: None,
                min: None,
                max: None,
            });
        }
    }

    Some(ParsedTable {
        headers,
        rows,
        total_rows,
        total_cols,
        column_stats,
    })
}

pub fn export_table_to_csv(headers: &[String], rows: &[Vec<String>]) -> String {
    let mut out = String::new();
    let quoted_headers: Vec<String> = headers
        .iter()
        .map(|h| format!("\"{}\"", h.replace('"', "\"\"")))
        .collect();
    out.push_str(&quoted_headers.join(","));
    out.push('\n');

    for row in rows {
        let quoted_cells: Vec<String> = row
            .iter()
            .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
            .collect();
        out.push_str(&quoted_cells.join(","));
        out.push('\n');
    }

    out
}

// ---------------------------------------------------------------------------
// HTTP Handlers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct TableAnalyzeRequest {
    pub content: String,
}

pub async fn handle_parse_and_stats(Json(req): Json<TableAnalyzeRequest>) -> Response {
    if let Some(parsed) = parse_markdown_table(&req.content) {
        let csv = export_table_to_csv(&parsed.headers, &parsed.rows);
        Json(json!({
            "success": true,
            "table": parsed,
            "csv": csv
        }))
        .into_response()
    } else {
        Json(json!({
            "success": false,
            "error": "No valid markdown table found in content"
        }))
        .into_response()
    }
}

#[derive(Deserialize)]
pub struct CalculateRangeRequest {
    pub func: String,
    pub range: String,
    pub cells: HashMap<String, f64>,
}

pub async fn handle_calculate_range(Json(req): Json<CalculateRangeRequest>) -> Response {
    let parsed_range = match parse_cell_range(&req.range) {
        Some(r) => r,
        None => {
            return Json(json!({ "success": false, "error": "Invalid cell range format (expected e.g. A1:B10)" }))
                .into_response();
        }
    };

    let mut grid = HashMap::new();
    for (coord_str, val) in req.cells {
        if let Some(coord) = parse_cell_coord(&coord_str) {
            grid.insert(coord, val);
        }
    }

    let result = compute_range_stat(&req.func, parsed_range, &grid);
    Json(json!({
        "success": true,
        "func": req.func.to_uppercase(),
        "range": req.range,
        "result": result
    }))
    .into_response()
}

// ---------------------------------------------------------------------------
// Post-Edit Formula & AST Validator (Item 3b)
// ---------------------------------------------------------------------------

/// List of standard supported spreadsheet formula functions.
pub const STANDARD_FORMULA_FUNCTIONS: &[&str] = &[
    "SUM", "AVERAGE", "AVG", "COUNT", "COUNTA", "COUNTIF", "COUNTIFS",
    "MIN", "MAX", "IF", "IFS", "VLOOKUP", "XLOOKUP", "HLOOKUP",
    "INDEX", "MATCH", "CONCAT", "CONCATENATE", "TEXT", "LEFT", "RIGHT",
    "MID", "LEN", "TRIM", "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "INT",
    "MOD", "POWER", "SQRT", "PRODUCT", "SUBTOTAL", "NOW", "TODAY", "DATE",
    "YEAR", "MONTH", "DAY", "AND", "OR", "NOT", "ISBLANK", "ISERROR",
    "ISNUMBER", "ISTEXT", "SUMIF", "SUMIFS", "AVERAGEIF", "AVERAGEIFS",
];

/// Validates a single formula string (e.g. "=SUM(A1:A10)").
/// Returns Ok(()) if syntax is sound, or Err(diagnostic) if invalid.
pub fn validate_formula_syntax(formula: &str) -> Result<(), String> {
    let trimmed = formula.trim();
    if !trimmed.starts_with('=') {
        return Err(format!("Spreadsheet formula must begin with '=': '{}'", formula));
    }

    let expr = trimmed[1..].trim();
    if expr.is_empty() {
        return Err("Formula expression after '=' cannot be empty".to_string());
    }

    // 1. Disallow literal error values
    for err_token in &["#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#N/A", "#NULL!", "#NUM!"] {
        if expr.contains(err_token) {
            return Err(format!("Formula contains invalid error token '{}': '{}'", err_token, formula));
        }
    }

    // 2. Check parenthesis balance and quotes
    let mut paren_depth = 0i32;
    let mut in_string = false;
    let mut current_ident = String::new();
    let mut identifiers = Vec::new();

    for ch in expr.chars() {
        if ch == '"' {
            in_string = !in_string;
            continue;
        }

        if in_string {
            continue;
        }

        if ch.is_ascii_alphanumeric() || ch == '_' {
            current_ident.push(ch);
        } else {
            if !current_ident.is_empty() {
                identifiers.push((current_ident.clone(), ch == '('));
                current_ident.clear();
            }

            if ch == '(' {
                paren_depth += 1;
            } else if ch == ')' {
                paren_depth -= 1;
                if paren_depth < 0 {
                    return Err(format!("Unmatched closing parenthesis in formula: '{}'", formula));
                }
            }
        }
    }

    if in_string {
        return Err(format!("Unclosed string quote in formula: '{}'", formula));
    }

    if paren_depth != 0 {
        return Err(format!("Unbalanced parentheses in formula (missing {} closing ')'): '{}'", paren_depth, formula));
    }

    if !current_ident.is_empty() {
        identifiers.push((current_ident, false));
    }

    // 3. Verify function calls match standard names
    for (ident, is_func) in identifiers {
        if is_func {
            let upper = ident.to_ascii_uppercase();
            if !STANDARD_FORMULA_FUNCTIONS.contains(&upper.as_str()) {
                return Err(format!("Unknown or mistyped spreadsheet function '{}' in formula: '{}'", ident, formula));
            }
        }
    }

    // 4. Validate ranges (e.g. A1:B10)
    for part in expr.split(|c: char| c == '+' || c == '-' || c == '*' || c == '/' || c == '(' || c == ')' || c == ',') {
        let clean_part = part.trim();
        if clean_part.contains(':') && parse_cell_range(clean_part).is_none() {
            return Err(format!("Malformed cell range '{}' in formula: '{}'", clean_part, formula));
        }
    }

    Ok(())
}

/// Validates a batch of cell updates before committing to disk or Excel.
/// Returns Ok(()) or a list of specific validation failures.
pub fn validate_cell_updates(cells: &[(String, String)]) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();

    for (coord, val) in cells {
        // Validate coordinate
        if parse_cell_coord(coord).is_none() {
            errors.push(format!("Invalid cell coordinate: '{}'", coord));
        }

        // If it's a formula, validate syntax
        let trimmed_val = val.trim();
        if trimmed_val.starts_with('=') {
            if let Err(err) = validate_formula_syntax(trimmed_val) {
                errors.push(format!("Cell '{}': {}", coord, err));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cell_coords_and_ranges() {
        assert_eq!(col_letter_to_index("A"), Some(1));
        assert_eq!(col_letter_to_index("Z"), Some(26));
        assert_eq!(col_letter_to_index("AA"), Some(27));
        assert_eq!(index_to_col_letter(1), "A");
        assert_eq!(index_to_col_letter(26), "Z");
        assert_eq!(index_to_col_letter(27), "AA");

        assert_eq!(parse_cell_coord("A1"), Some((1, 1)));
        assert_eq!(parse_cell_coord("B14"), Some((2, 14)));
        assert_eq!(parse_cell_coord("AA20"), Some((27, 20)));

        let range = parse_cell_range("A1:B3").unwrap();
        assert_eq!(range, ((1, 1), (2, 3)));
    }

    #[test]
    fn test_compute_range_stat() {
        let mut grid = HashMap::new();
        grid.insert((1, 1), 10.0);
        grid.insert((1, 2), 20.0);
        grid.insert((1, 3), 30.0);

        let range = parse_cell_range("A1:A3").unwrap();
        assert_eq!(compute_range_stat("SUM", range, &grid), 60.0);
        assert_eq!(compute_range_stat("AVERAGE", range, &grid), 20.0);
        assert_eq!(compute_range_stat("COUNT", range, &grid), 3.0);
        assert_eq!(compute_range_stat("MIN", range, &grid), 10.0);
        assert_eq!(compute_range_stat("MAX", range, &grid), 30.0);
    }

    #[test]
    fn test_parse_markdown_table_and_csv() {
        let md = "# Sales Data\n| Item | Qty | Price |\n|---|---|---|\n| Coffee | 5 | 25000 |\n| Tea | 2 | 10000 |\nTotal: done.";
        let parsed = parse_markdown_table(md).expect("should parse table");
        assert_eq!(parsed.headers, vec!["Item", "Qty", "Price"]);
        assert_eq!(parsed.total_rows, 2);
        assert_eq!(parsed.total_cols, 3);
        assert!(parsed.column_stats[1].is_numeric);
        assert_eq!(parsed.column_stats[1].sum, Some(7.0));

        let csv = export_table_to_csv(&parsed.headers, &parsed.rows);
        assert!(csv.contains("\"Item\",\"Qty\",\"Price\""));
        assert!(csv.contains("\"Coffee\",\"5\",\"25000\""));
    }

    #[test]
    fn test_validate_formula_syntax_valid() {
        assert!(validate_formula_syntax("=SUM(A1:A10)").is_ok());
        assert!(validate_formula_syntax("=AVERAGE(B2:B20) + 5").is_ok());
        assert!(validate_formula_syntax("=IF(A1>0, \"Positive\", \"Zero\")").is_ok());
    }

    #[test]
    fn test_validate_formula_syntax_errors() {
        assert!(validate_formula_syntax("=SUM(A1:A10").is_err()); // Unbalanced paren
        assert!(validate_formula_syntax("=SMM(A1:A10)").is_err()); // Unknown function
        assert!(validate_formula_syntax("=A1 + #REF!").is_err()); // Error token
        assert!(validate_formula_syntax("=SUM(A1:A)").is_err()); // Malformed range
        assert!(validate_formula_syntax("SUM(A1:A10)").is_err()); // Missing '='
    }

    #[test]
    fn test_validate_cell_updates() {
        let good_cells = vec![
            ("A1".to_string(), "Revenue".to_string()),
            ("A2".to_string(), "1000".to_string()),
            ("A3".to_string(), "=SUM(A1:A2)".to_string()),
        ];
        assert!(validate_cell_updates(&good_cells).is_ok());

        let bad_cells = vec![
            ("99Invalid".to_string(), "100".to_string()),
            ("B5".to_string(), "=UNKNOWNFUNC(B1:B4)".to_string()),
        ];
        let errs = validate_cell_updates(&bad_cells).expect_err("should have errors");
        assert_eq!(errs.len(), 2);
    }
}
