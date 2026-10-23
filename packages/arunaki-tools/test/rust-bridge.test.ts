import { describe, expect, it } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as XLSX from "xlsx"
import JSZip from "jszip"
import { buildExcelMap } from "../src/excel-read"
import { buildWordMap } from "../src/word-read"
import { buildPptMap } from "../src/ppt-read"
import { findRustDocsBinary, isRustToolsEnabled } from "../src/rust-bridge"

describe("Rust Document Sidecar Bridge & Fallback Parity", () => {
  it("defaults to feature flag OFF so standard TS workflow is untouched", () => {
    const prev = process.env.ARUNAKI_RUST_TOOLS
    delete process.env.ARUNAKI_RUST_TOOLS
    try {
      expect(isRustToolsEnabled()).toBe(false)
    } finally {
      if (prev !== undefined) process.env.ARUNAKI_RUST_TOOLS = prev
    }
  })

  it("locates compiled arunaki-docs binary and produces identical WordMap as TS", async () => {
    const bin = findRustDocsBinary()
    expect(bin).not.toBeNull()

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-rust-word-"))
    const filePath = path.join(tmpDir, "laporan.docx")

    const zip = new JSZip()
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    )
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
        </w:tbl>
      </w:body>
    </w:document>`
    zip.file("word/document.xml", docXml)
    fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }))

    try {
      delete process.env.ARUNAKI_RUST_TOOLS
      const tsMap = await buildWordMap(filePath)

      process.env.ARUNAKI_RUST_TOOLS = "1"
      const rustMap = await buildWordMap(filePath)

      expect(rustMap).toEqual(tsMap)
    } finally {
      delete process.env.ARUNAKI_RUST_TOOLS
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("produces identical ExcelMap on .xlsx via Rust sidecar and falls back cleanly on missing binary", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-rust-excel-"))
    const filePath = path.join(tmpDir, "data.xlsx")

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ["NAMA", "UKURAN"],
      ["Budi", "M"],
      ["Siti", "L"],
    ])
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    XLSX.writeFile(wb, filePath)

    try {
      delete process.env.ARUNAKI_RUST_TOOLS
      const tsMap = buildExcelMap(filePath)

      process.env.ARUNAKI_RUST_TOOLS = "1"
      const rustMap = buildExcelMap(filePath)
      expect(rustMap).toEqual(tsMap)

      // Simulate missing/broken Rust binary -> automatic TS fallback without error
      process.env.ARUNAKI_RUST_DOCS_BIN = path.join(tmpDir, "non-existent-arunaki-docs.exe")
      const fallbackMap = buildExcelMap(filePath)
      expect(fallbackMap).toEqual(tsMap)
    } finally {
      delete process.env.ARUNAKI_RUST_TOOLS
      delete process.env.ARUNAKI_RUST_DOCS_BIN
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("produces identical PptMap via Rust sidecar", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arunaki-rust-ppt-"))
    const filePath = path.join(tmpDir, "deck.pptx")

    const zip = new JSZip()
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Hello Rust</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    )
    fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }))

    try {
      delete process.env.ARUNAKI_RUST_TOOLS
      const tsMap = await buildPptMap(filePath)

      process.env.ARUNAKI_RUST_TOOLS = "1"
      const rustMap = await buildPptMap(filePath)

      expect(rustMap).toEqual(tsMap)
    } finally {
      delete process.env.ARUNAKI_RUST_TOOLS
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
