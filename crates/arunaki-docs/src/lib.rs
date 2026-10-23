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
            <w:p><w:r><w:t>Daftar Ukuran Seragam</w:t></w:r></w:p>
            <w:tbl>
              <w:tr>
                <w:tc><w:p><w:r><w:t>Ukuran</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Jumlah</w:t></w:r></w:p></w:tc>
              </w:tr>
              <w:tr>
                <w:tc><w:p><w:r><w:t>M</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>"#;

        let out = build_word_map_from_xml("laporan.docx", xml);
        assert_eq!(
            out,
            r#"{"format":"word","filePath":"laporan.docx","paragraphs":[{"index":1,"text":"Daftar Ukuran Seragam"}],"tables":[{"index":1,"rows":[["Ukuran","Jumlah"],["M","10"]]}]}"#
        );
    }

    #[test]
    fn csv_excel_map_extracts_cells_and_range() {
        let csv = "Item,Qty\nBaju M,15\n";
        let out = build_csv_excel_map("order.csv", csv);
        assert!(out.contains(r#""format":"excel""#));
        assert!(out.contains(r#""range":"A1:B2""#));
        assert!(out.contains(r#""ref":"B2","value":15,"text":"15","type":"n""#));
    }

    #[test]
    fn pdf_map_extracts_selectable_text() {
        let pdf = b"%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (Laporan Bulanan) Tj ET\nendstream\nendobj\n%%EOF";
        let out = build_pdf_map_from_bytes("test.pdf", pdf, None).unwrap();
        assert!(out.contains(r#""format":"pdf""#));
        assert!(out.contains(r#""pageCount":1"#));
        assert!(out.contains(r#""isScanned":false"#));
        assert!(out.contains("Laporan Bulanan"));
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
    }

    #[test]
    fn cell_ref_roundtrip() {
        assert_eq!(parse_cell_ref("A1"), Some((0, 0)));
        assert_eq!(parse_cell_ref("C6"), Some((5, 2)));
        assert_eq!(encode_cell_ref(5, 2), "C6");
    }
}
