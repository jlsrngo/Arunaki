import { Effect, Schema } from "effect"
import * as Tool from "@arunaki/engine/tool"
import * as fs from "fs"
import * as path from "path"
import JSZip from "jszip"
import { PptMap } from "./docmap"
import { recordNativeAttempt, recordNativeFailure } from "./doc-fallback"

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the PowerPoint presentation (.pptx) to read (relative to workspace or absolute)",
  }),
})

type Metadata = Record<string, unknown>

export async function buildPptMap(filePath: string): Promise<typeof PptMap.Type> {
  const buf = await fs.promises.readFile(filePath)
  const zip = await JSZip.loadAsync(buf)

  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))

  const slides = []
  for (const name of slideNames) {
    const xml = await zip.file(name)!.async("string")
    const shapes = []
    const spRe = /<p:sp\b[\s\S]*?<\/p:sp>/g
    let m: RegExpExecArray | null
    while ((m = spRe.exec(xml)) !== null) {
      const block = m[0]
      const idMatch = block.match(/<p:cNvPr\b[^>]*\bid="(\d+)"/)
      const nameMatch = block.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/)
      const text = (block.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
        .map((t) => t.replace(/<\/?a:t>/g, ""))
        .join("\n")
        .trim()
      shapes.push({
        id: idMatch ? Number(idMatch[1]) : -1,
        name: nameMatch ? nameMatch[1] : null,
        text: text || null,
      })
    }
    const number = Number(name.match(/\d+/)![0])
    slides.push({ number, shapes })
  }

  return { format: "ppt", filePath, slides }
}

export const PptReadTool = Tool.define(
  "ppt_read",
  Effect.succeed({
    description: `Read, extract, and inspect slides, text, and shapes from a PowerPoint presentation (.pptx). Returns a complete Document Map (JSON) with slide numbers, shapes, and extracted text. ALWAYS use this tool to inspect presentations natively with zero external dependencies, instead of python scripts or COM.`,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        recordNativeAttempt(ctx?.sessionID, params.filePath)
        const baseDir = typeof ctx?.extra?.directory === "string" ? ctx.extra.directory : process.cwd()
        let filePath = params.filePath
        if (!path.isAbsolute(filePath)) {
          filePath = path.resolve(baseDir, filePath)
        }

        if (!fs.existsSync(filePath)) {
          const baseName = path.basename(params.filePath)
          const fallback = path.join(baseDir, baseName)
          if (fs.existsSync(fallback)) {
            filePath = fallback
          } else {
            try {
              const files = fs.readdirSync(baseDir)
              const match = files.find(
                (f) =>
                  f.toLowerCase() === baseName.toLowerCase() ||
                  (f.endsWith(".pptx") && f.toLowerCase().includes(baseName.toLowerCase().replace(".pptx", ""))),
              )
              if (match) {
                filePath = path.join(baseDir, match)
              }
            } catch {}
          }
        }

        if (!fs.existsSync(filePath)) {
          recordNativeFailure(ctx?.sessionID, params.filePath)
          return {
            title: "PPT read: file not found",
            output: `ERROR: ${params.filePath} not found in workspace (${baseDir})`,
            metadata: { slides: 0 },
          }
        }
        try {
          const map = yield* Effect.tryPromise({ try: () => buildPptMap(filePath), catch: (e) => new Error(String(e)) })
          return {
            title: `PPT read: ${path.basename(filePath)}`,
            output: JSON.stringify(map),
            metadata: { slides: map.slides.length },
          }
        } catch (e) {
          recordNativeFailure(ctx?.sessionID, params.filePath)
          return { title: "PPT read failed", output: `ERROR: ${e}`, metadata: { slides: 0 } }
        }
      }).pipe(Effect.orDie),
  }),
)