import { describe, expect, it } from "bun:test"
import { Effect, Layer, Exit } from "effect"
import { ToolRegistry } from "../src/tool/registry"
import { BuiltInTools } from "../src/tool/builtins"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { Location } from "../src/location"
import { LocationMutation } from "../src/location-mutation"
import { PermissionV2 } from "../src/permission"
import { Global } from "../src/global"
import { FSUtil } from "../src/fs-util"
import { Config } from "../src/config"
import { AbsolutePath } from "../src/schema"
import { location } from "./fixture/location"
import { toolDefinitions, executeTool, toolIdentity } from "./lib/tool"
import { SessionV2 } from "../src/session"
import * as fs from "fs"
import * as path from "path"
import JSZip from "jszip"
import * as XLSX from "xlsx"

import { ToolOutputStore } from "../src/tool-output-store"

describe("V2 Native Document Read Tools", () => {
  const locRef = Location.Ref.make({ directory: AbsolutePath.make(process.cwd()) })
  const locationLayer = Layer.succeed(Location.Service, Location.Service.of(location(locRef)))

  const testLayer = AppNodeBuilder.build(
    LayerNode.group([ToolRegistry.node, ToolRegistry.toolsNode, BuiltInTools.node]),
    [
      [Location.node, locationLayer],
      [LocationMutation.node, Layer.succeed(LocationMutation.Service, LocationMutation.Service.of({
        resolve: ({ path: p }) => Effect.succeed({ canonical: path.resolve(process.cwd(), p), externalDirectory: undefined }),
        apply: () => Effect.void,
      }))],
      [PermissionV2.node, Layer.succeed(PermissionV2.Service, PermissionV2.Service.of({
        assert: () => Effect.void,
        check: () => Effect.succeed({ granted: true }),
      }))],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({
        get: () => Effect.succeed({} as any),
        entries: () => Effect.succeed([]),
      } as any))],
      [FSUtil.node, Layer.succeed(FSUtil.Service, {} as any)],
      [Global.node, Global.layerWith({ data: Global.Path.data })],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ]
  )

  it("registers excel_read, word_read, ppt_read, and pdf_read in BuiltInTools", async () => {
    await Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const tools = yield* toolDefinitions(registry)
      const toolNames = tools.map((t) => t.name)
      expect(toolNames).toContain("excel_read")
      expect(toolNames).toContain("word_read")
      expect(toolNames).toContain("ppt_read")
      expect(toolNames).toContain("pdf_read")
      expect(toolNames).toContain("image_ocr")
    }).pipe(Effect.provide(testLayer), Effect.runPromise)
  })

  it("executes word_read on a sample .docx", async () => {
    // Generate a minimal test .docx with JSZip
    const zip = new JSZip()
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Halo Arunaki Word Read</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Nama</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Ukuran</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Budi</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>XL</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`)
    const docxBuf = await zip.generateAsync({ type: "nodebuffer" })
    const tmpDocx = path.join(process.cwd(), "test_sample_word.docx")
    fs.writeFileSync(tmpDocx, docxBuf)

    try {
      await Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const res = yield* executeTool(registry, {
          sessionID: SessionV2.ID.make("ses_test"),
          ...toolIdentity,
          call: {
            type: "tool-call",
            id: "call-word",
            name: "word_read",
            input: { filePath: tmpDocx },
          },
        })
        expect(res).toBeDefined()
        const parsed = JSON.parse((res as any).value)
        expect(parsed.format).toBe("word")
        expect(parsed.paragraphs[0].text).toContain("Halo Arunaki Word Read")
        expect(parsed.tables[0].rows).toEqual([["Nama", "Ukuran"], ["Budi", "XL"]])
      }).pipe(Effect.provide(testLayer), Effect.runPromise)
    } finally {
      if (fs.existsSync(tmpDocx)) fs.unlinkSync(tmpDocx)
    }
  })

  it("executes excel_read on a sample .xlsx", async () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nama", "Ukuran", "Qty"],
      ["Baju A", "L", 45],
      ["Baju B", "XL", 45],
    ])
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    const tmpXlsx = path.join(process.cwd(), "test_sample_excel.xlsx")
    XLSX.writeFile(wb, tmpXlsx)

    try {
      await Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const res = yield* executeTool(registry, {
          sessionID: SessionV2.ID.make("ses_test"),
          ...toolIdentity,
          call: {
            type: "tool-call",
            id: "call-excel",
            name: "excel_read",
            input: { filePath: tmpXlsx },
          },
        })
        expect(res).toBeDefined()
        const parsed = JSON.parse((res as any).value)
        expect(parsed.format).toBe("excel")
        expect(parsed.sheets[0].name).toBe("Sheet1")
        expect(parsed.sheets[0].rowCount).toBe(3)
      }).pipe(Effect.provide(testLayer), Effect.runPromise)
    } finally {
      if (fs.existsSync(tmpXlsx)) fs.unlinkSync(tmpXlsx)
    }
  })

  it("executes pdf_read on a sample .pdf", async () => {
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
    const tmpPdf = path.join(process.cwd(), "test_sample_pdf.pdf")
    fs.writeFileSync(tmpPdf, samplePdf)

    try {
      await Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const res = yield* executeTool(registry, {
          sessionID: SessionV2.ID.make("ses_test"),
          ...toolIdentity,
          call: {
            type: "tool-call",
            id: "call-pdf",
            name: "pdf_read",
            input: { filePath: tmpPdf },
          },
        })
        expect(res).toBeDefined()
        const parsed = JSON.parse((res as any).value)
        expect(parsed.format).toBe("pdf")
        expect(parsed.pageCount).toBe(1)
        expect(parsed.isScanned).toBe(true)
      }).pipe(Effect.provide(testLayer), Effect.runPromise)
    } finally {
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf)
    }
  })

  it("executes image_ocr on a sample image", async () => {
    const minimalPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    )
    const tmpImg = path.join(process.cwd(), "test_sample_ocr.png")
    fs.writeFileSync(tmpImg, minimalPng)

    try {
      await Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const res = yield* executeTool(registry, {
          sessionID: SessionV2.ID.make("ses_test"),
          ...toolIdentity,
          call: {
            type: "tool-call",
            id: "call-ocr",
            name: "image_ocr",
            input: { filePath: tmpImg },
          },
        })
        expect(res).toBeDefined()
        const parsed = JSON.parse((res as any).value)
        expect(parsed.format).toBe("ocr")
        expect(typeof parsed.confidence).toBe("number")
        expect(Array.isArray(parsed.lines)).toBe(true)
      }).pipe(Effect.provide(testLayer), Effect.runPromise)
    } finally {
      if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg)
    }
  })
})

