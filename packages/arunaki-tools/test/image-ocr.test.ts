import { describe, expect, it, afterAll } from "bun:test"
import * as path from "path"
import * as fs from "fs"
import { buildImageOcrMap, terminateOcrWorker } from "../src/image-ocr"

describe("image-ocr", () => {
  afterAll(async () => {
    await terminateOcrWorker()
  })

  it("exports buildImageOcrMap function", () => {
    expect(typeof buildImageOcrMap).toBe("function")
  })

  it("handles non-existent image file gracefully", async () => {
    await expect(buildImageOcrMap("non_existent_image.png")).rejects.toThrow()
  })

  it("extracts text and lines from a valid test image", async () => {
    // A minimal 1x1 transparent PNG buffer
    const minimalPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    )
    const tmpFile = path.join(process.cwd(), "test_minimal.png")
    fs.writeFileSync(tmpFile, minimalPng)

    try {
      const result = await buildImageOcrMap(tmpFile)
      expect(result.format).toBe("ocr")
      expect(typeof result.confidence).toBe("number")
      expect(Array.isArray(result.lines)).toBe(true)
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    }
  }, 30000)
})
