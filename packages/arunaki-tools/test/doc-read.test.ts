import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import * as XLSX from "xlsx"
import JSZip from "jszip"
import { ExcelReadTool } from "../src/excel-read"
import { WordReadTool } from "../src/word-read"
import { PptReadTool } from "../src/ppt-read"
import { PdfReadTool } from "../src/pdf-read"
import * as Tool from "@arunaki/engine/tool"
import { Truncate } from "@arunaki/engine/tool/truncate"
import { Agent } from "@arunaki/engine/agent/agent"
import { Layer } from "effect"

const mockTruncate = Layer.succeed(Truncate.Service, {
  output: (content: string) => Effect.succeed({ content, truncated: false }),
  limits: () => Effect.succeed({ maxLines: 2000, maxBytes: 50000 }),
} as any)

const mockAgent = Layer.succeed(Agent.Service, {
  get: () => Effect.succeed({} as any),
} as any)

const testLayer = Layer.merge(mockTruncate, mockAgent)

describe("Document Read Native Tools E2E", () => {
  it("excel_read reads xlsx spreadsheet and extracts data accurately", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-test-excel-"))
    const filePath = path.join(tmpDir, "data PEGAWAI.xlsx")

    // Create an Excel file with employee clothes size data
    const wb = XLSX.utils.book_new()
    const data = [
      ["NAMA", "DEPARTEMEN", "UKURAN"],
      ["Budi", "IT", "M"],
      ["Siti", "HRD", "L"],
      ["Ahmad", "Finance", "XL"],
      ["Dewi", "Marketing", "M"],
      ["Eko", "Operations", "XXL"],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    XLSX.writeFile(wb, filePath)

    // Execute excel_read tool
    const toolInfo = await Effect.runPromise(ExcelReadTool.pipe(Effect.provide(testLayer)))
    const toolDef = await Effect.runPromise(Tool.init(toolInfo).pipe(Effect.provide(testLayer)))

    const mockCtx: any = {
      extra: { directory: tmpDir },
    }

    const result = await Effect.runPromise(
      toolDef.execute({ filePath: "data PEGAWAI.xlsx" }, mockCtx).pipe(Effect.provide(testLayer))
    )

    expect(result.title).toBe("Excel read: data PEGAWAI.xlsx")
    const parsed = JSON.parse(result.output)
    expect(parsed.format).toBe("excel")
    expect(parsed.sheets.length).toBe(1)
    expect(parsed.sheets[0].name).toBe("Sheet1")
    expect(parsed.sheets[0].cells.length).toBe(18) // 6 rows x 3 cols

    // Check cells
    const cellMap = Object.fromEntries(parsed.sheets[0].cells.map((c: any) => [c.ref, c.value]))
    expect(cellMap["A1"]).toBe("NAMA")
    expect(cellMap["C1"]).toBe("UKURAN")
    expect(cellMap["C2"]).toBe("M")
    expect(cellMap["C3"]).toBe("L")
    expect(cellMap["C4"]).toBe("XL")
    expect(cellMap["C5"]).toBe("M")
    expect(cellMap["C6"]).toBe("XXL")

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("word_read reads docx document and extracts paragraphs/tables accurately", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-test-word-"))
    const filePath = path.join(tmpDir, "laporan.docx")

    // Create a minimal synthetic docx with JSZip
    const zip = new JSZip()
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`)
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
          <w:tr>
            <w:tc><w:p><w:r><w:t>L</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>14</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
      </w:body>
    </w:document>`
    zip.file("word/document.xml", docXml)
    const buf = await zip.generateAsync({ type: "nodebuffer" })
    fs.writeFileSync(filePath, buf)

    const toolInfo = await Effect.runPromise(WordReadTool.pipe(Effect.provide(testLayer)))
    const toolDef = await Effect.runPromise(Tool.init(toolInfo).pipe(Effect.provide(testLayer)))

    const mockCtx: any = {
      extra: { directory: tmpDir },
    }

    const result = await Effect.runPromise(
      toolDef.execute({ filePath: "laporan.docx" }, mockCtx).pipe(Effect.provide(testLayer))
    )

    expect(result.title).toBe("Word read: laporan.docx")
    const parsed = JSON.parse(result.output)
    expect(parsed.format).toBe("word")
    expect(parsed.paragraphs.length).toBe(1)
    expect(parsed.paragraphs[0].text).toBe("Daftar Ukuran Seragam")
    expect(parsed.tables.length).toBe(1)
    expect(parsed.tables[0].rows.length).toBe(3)
    expect(parsed.tables[0].rows[0]).toEqual(["Ukuran", "Jumlah"])
    expect(parsed.tables[0].rows[1]).toEqual(["M", "10"])
    expect(parsed.tables[0].rows[2]).toEqual(["L", "14"])

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("pdf_read reads pdf document and extracts structure accurately", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-test-pdf-"))
    const filePath = path.join(tmpDir, "sample.pdf")

    // Minimal valid PDF with 1 page
    const samplePdf = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Resources <<>>
>>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<<
/Size 4
/Root 1 0 R
>>
startxref
200
%%EOF`

    fs.writeFileSync(filePath, samplePdf)

    const toolInfo = await Effect.runPromise(PdfReadTool.pipe(Effect.provide(testLayer)))
    const toolDef = await Effect.runPromise(Tool.init(toolInfo).pipe(Effect.provide(testLayer)))

    const mockCtx: any = {
      extra: { directory: tmpDir },
    }

    const result = await Effect.runPromise(
      toolDef.execute({ filePath: "sample.pdf" }, mockCtx).pipe(Effect.provide(testLayer))
    )

    expect(result.title).toContain("PDF read: sample.pdf")
    const parsed = JSON.parse(result.output)
    expect(parsed.format).toBe("pdf")
    expect(parsed.pageCount).toBe(1)
    expect(parsed.isScanned).toBe(true)

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
