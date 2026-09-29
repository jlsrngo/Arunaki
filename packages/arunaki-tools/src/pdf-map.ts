import * as fs from "fs"
import { PDFParse } from "pdf-parse"
import { PdfMap } from "./docmap"

export async function buildPdfMap(filePath: string, maxPages?: number): Promise<typeof PdfMap.Type> {
  const buf = await fs.promises.readFile(filePath)
  const parser = new PDFParse({ data: buf })
  let textResult: any = null
  let infoResult: any = null

  try {
    textResult = await parser.getText()
    try {
      infoResult = await parser.getInfo()
    } catch {
      // Info extraction is optional
    }
  } finally {
    try {
      await parser.destroy()
    } catch {}
  }

  const rawPages: Array<{ text: string; num: number }> = textResult?.pages || []
  const totalPages = textResult?.total || rawPages.length || 1
  const limit = maxPages && maxPages > 0 ? Math.min(maxPages, rawPages.length) : rawPages.length

  const pages = (limit > 0 ? rawPages.slice(0, limit) : rawPages).map((p, idx) => ({
    number: p.num ?? idx + 1,
    text: (p.text || "").trim(),
  }))

  const combinedText = pages.map((p) => `--- PAGE ${p.number} ---\n${p.text}`).join("\n\n").trim()
  const hasText = pages.some((p) => p.text.length > 0)
  const isScanned = !hasText

  return {
    format: "pdf",
    filePath,
    pageCount: totalPages,
    isScanned,
    text: isScanned
      ? "[No selectable text found in this PDF. It appears to be a scanned document or image-only PDF.]"
      : combinedText,
    pages,
    info: infoResult?.info ? (infoResult.info as Record<string, unknown>) : null,
  }
}
