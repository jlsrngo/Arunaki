pub mod com;
pub mod excel;
pub mod pdf;
pub mod ppt;
pub mod util;
pub mod word;

// Re-export all public functions and types for 100% backward compatibility
pub use com::*;
pub use excel::*;
pub use pdf::*;
pub use ppt::*;
pub use util::*;
pub use word::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_xml_extracts_paragraphs_and_tables_matching_docmap() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>Uniform Size List</w:t></w:r></w:p>
            <w:tbl>
              <w:tr>
                <w:tc><w:p><w:r><w:t>Size</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Quantity</w:t></w:r></w:p></w:tc>
              </w:tr>
              <w:tr>
                <w:tc><w:p><w:r><w:t>M</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>"#;

        let out = build_word_map_from_xml("report.docx", xml);
        assert_eq!(
            out,
            r#"{"format":"word","filePath":"report.docx","paragraphs":[{"index":1,"text":"Uniform Size List"}],"tables":[{"index":1,"rows":[["Size","Quantity"],["M","10"]]}]}"#
        );
    }

    #[test]
    fn csv_excel_map_extracts_cells_and_range() {
        let csv = "Item,Qty\nShirt M,15\n";
        let out = build_csv_excel_map("order.csv", csv);
        assert!(out.contains(r#""format":"excel""#));
        assert!(out.contains(r#""range":"A1:B2""#));
        assert!(out.contains(r#""ref":"B2","value":15,"text":"15","type":"n""#));
    }

    #[test]
    fn pdf_map_extracts_selectable_text() {
        let pdf = b"%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (Monthly Report) Tj ET\nendstream\nendobj\n%%EOF";
        let out = build_pdf_map_from_bytes("test.pdf", pdf, None).unwrap();
        assert!(out.contains(r#""format":"pdf""#));
        assert!(out.contains(r#""pageCount":1"#));
        assert!(out.contains(r#""isScanned":false"#));
        assert!(out.contains("Monthly Report"));
    }

    #[test]
    fn pdf_map_extracts_tables_and_bounding_box() {
        let pdf = b"%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Length 120 >>\nstream\nBT /F1 12 Tf 72 720 Td (Invoice Summary) Tj ET\nBT /F1 12 Tf 72 680 Td (Item    Qty    Price    Total) Tj ET\nBT /F1 12 Tf 72 650 Td (Apples    10    15.000    150.000) Tj ET\nBT /F1 12 Tf 72 620 Td (Oranges    5    20.000    100.000) Tj ET\nendstream\nendobj\n%%EOF";
        let out = build_pdf_map_from_bytes("invoice.pdf", pdf, None).unwrap();
        assert!(out.contains(r#""tables""#));
        assert!(out.contains("Apples"));
        assert!(out.contains("150.000"));
        assert!(out.contains(r#""bbox""#));
    }

    #[test]
    fn com_scripts_generate_expected_powershell() {
        let script = build_excel_com_script(&ExcelComParams {
            action: "write_cell".to_string(),
            file_path: Some("E:/test.xlsx".to_string()),
            sheet_name: Some("Sheet1".to_string()),
            cell: Some("B5".to_string()),
            value: Some("42".to_string()),
            cells: vec![],
            bold: None,
            italic: None,
            font_size: None,
            bg_color: None,
            alignment: None,
            source_sheet: None,
            new_sheet_name: None,
        });
        assert!(script.contains("$ws.Range('B5').Value2 = '42'"));
        assert!(script.contains("OK:write_cell:B5"));

        // Test action: "write" alias and formula
        let script_write = build_excel_com_script(&ExcelComParams {
            action: "write".to_string(),
            file_path: Some("E:/test.xlsx".to_string()),
            sheet_name: Some("Sheet1".to_string()),
            cell: Some("X2".to_string()),
            value: Some("=SUM(X3:X10)".to_string()),
            cells: vec![],
            bold: Some(true),
            italic: None,
            font_size: Some(12.0),
            bg_color: None,
            alignment: Some("center".to_string()),
            source_sheet: None,
            new_sheet_name: None,
        });
        assert!(script_write.contains("$ws.Range('X2').Formula = '=SUM(X3:X10)'"));
        assert!(script_write.contains("$ws.Range('X2').Font.Bold = $true"));
        assert!(script_write.contains("$ws.Range('X2').HorizontalAlignment = -4108"));
        assert!(script_write.contains("OK:write:X2"));

        // Test action: "open"
        let script_open = build_excel_com_script(&ExcelComParams {
            action: "open".to_string(),
            file_path: Some("E:/test.xlsx".to_string()),
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
        });
        assert!(script_open.contains("$excel.Visible = $true"));
        assert!(script_open.contains("OK:open"));
        assert!(!script_open.contains("$wb.Close"));

        // Test action: "summary"
        let script_sum = build_excel_com_script(&ExcelComParams {
            action: "summary".to_string(),
            file_path: Some("E:/test.xlsx".to_string()),
            sheet_name: None,
            cell: Some("X13".to_string()),
            value: None,
            cells: vec![],
            bold: None,
            italic: None,
            font_size: None,
            bg_color: None,
            alignment: None,
            source_sheet: None,
            new_sheet_name: None,
        });
        assert!(script_sum.contains("$excel.CalculateFull()"));
        assert!(script_sum.contains("OK:summary:X13="));

        // Test Word COM: open & append
        let word_script = build_word_com_script(&WordComParams {
            action: "append".to_string(),
            file_path: Some("report.docx".to_string()),
            text: Some("New section added.".to_string()),
            paragraph_index: None,
            find_text: None,
            replace_text: None,
            bold: None,
            font_size: None,
            alignment: None,
        });
        assert!(word_script.contains("$doc.Content.InsertAfter('New section added.')"));
        assert!(word_script.contains("OK:append"));

        // Test Word COM: replace
        let word_replace = build_word_com_script(&WordComParams {
            action: "replace".to_string(),
            file_path: Some("report.docx".to_string()),
            text: None,
            paragraph_index: None,
            find_text: Some("[NAMA]".to_string()),
            replace_text: Some("Budi".to_string()),
            bold: None,
            font_size: None,
            alignment: None,
        });
        assert!(word_replace.contains("$find.Text = '[NAMA]'"));
        assert!(word_replace.contains("$find.Replacement.Text = 'Budi'"));
        assert!(word_replace.contains("OK:replace"));
    }

    #[test]
    fn cell_ref_roundtrip() {
        assert_eq!(parse_cell_ref("A1"), Some((0, 0)));
        assert_eq!(parse_cell_ref("C6"), Some((5, 2)));
        assert_eq!(encode_cell_ref(5, 2), "C6");
    }
}
