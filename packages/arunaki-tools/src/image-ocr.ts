import * as fs from "fs"
import * as path from "path"
import { createWorker, PSM, type Worker } from "tesseract.js"
import { ImageOcrMap } from "./docmap"

let workerInstance: Worker | null = null
let workerInitializing: Promise<Worker> | null = null

async function getWorker(languages: string[] = ["eng", "ind"]): Promise<Worker> {
  if (workerInstance) return workerInstance
  if (!workerInitializing) {
    workerInitializing = (async () => {
      try {
        const worker = await createWorker(languages)
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
        workerInstance = worker
        return worker
      } catch (err) {
        // Fallback to English only if multilingual pack fails to load
        console.warn("[image-ocr] Failed to initialize multilingual worker, falling back to 'eng':", err)
        const worker = await createWorker("eng")
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
        workerInstance = worker
        return worker
      } finally {
        workerInitializing = null
      }
    })()
  }
  return workerInitializing
}

/**
 * Terminate the shared OCR worker (useful during cleanup or tests).
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    const w = workerInstance
    workerInstance = null
    try {
      await w.terminate()
    } catch {}
  }
}

/**
 * Perform native OCR on an image file (.png, .jpg, .jpeg, .webp, .bmp) or Buffer.
 * Extracts full text, confidence, and line-by-line structured content (<1.5s).
 */
export async function buildImageOcrMap(
  input: string | Buffer,
  languages: string[] = ["eng", "ind"],
): Promise<ImageOcrMap> {
  let imageSource: string | Buffer = input
  let displayPath = "in-memory-image"

  if (typeof input === "string") {
    displayPath = path.basename(input)
    if (!fs.existsSync(input)) {
      throw new Error(`Image file not found: ${input}`)
    }
    imageSource = input
  }

  const worker = await getWorker(languages)
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
  let result = await worker.recognize(imageSource)

  let rawText = (result.data.text || "").trim()
  let confidence = Math.round(result.data.confidence ?? 0)

  // If confidence is low (< 50) or extracted text is very brief, retry with PSM 4 (single column / structured table)
  if (confidence < 50 || rawText.length < 10) {
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN })
      const retry = await worker.recognize(imageSource)
      const retryText = (retry.data.text || "").trim()
      const retryConfidence = Math.round(retry.data.confidence ?? 0)
      if (retryConfidence > confidence || retryText.length > rawText.length) {
        result = retry
        rawText = retryText
        confidence = retryConfidence
      } else {
        // Reset back to 3
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
      }
    } catch {}
  }

  // Split lines and filter empty noise
  const rawLines = rawText.split(/\r?\n/)
  const lines: { lineNumber: number; text: string }[] = []
  let lineIdx = 1

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (trimmed.length > 0) {
      lines.push({ lineNumber: lineIdx++, text: trimmed })
    }
  }

  return {
    format: "ocr" as const,
    filePath: typeof input === "string" ? input : displayPath,
    confidence,
    text: rawText,
    lines,
  }
}
