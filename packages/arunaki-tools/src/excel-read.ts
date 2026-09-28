import { Effect, Schema } from "effect"
import * as Tool from "@arunaki/engine/tool"
import * as XLSX from "xlsx"
import * as fs from "fs"
import * as path from "path"
import { ExcelMap } from "./docmap"
import { recordNativeAttempt, recordNativeFailure } from "./doc-fallback"

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the Excel workbook (.xlsx, .xls, .csv) to read (relative to workspace or absolute)",
  }),
})

type Metadata = Record<string, unknown>

export function buildExcelMap(filePath: string): typeof ExcelMap.Type {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    cellNF: true,
    cellFormula: true,
    cellStyles: false,
  })

  const sheets = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name]
    const ref = ws["!ref"] ?? null
    const cells = []
    let rowCount = 0
    let colCount = 0

    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      rowCount = range.e.r - range.s.r + 1
      colCount = range.e.c - range.s.c + 1
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const address = XLSX.utils.encode_cell({ r: R, c: C })
          const cell = ws[address]
          if (!cell) continue
          cells.push({
            ref: address,
            value: cell.v ?? null,
            text: cell.w ?? null,
            type: cell.t ?? null,
            formula: cell.f ?? null,
          })
        }
      }
    }

    return {
      name,
      range: ref,
      rowCount,
      colCount,
      cells,
      merges: (ws["!merges"] ?? []).map((m: XLSX.Range) => ({
        anchor: XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c }),
        end: XLSX.utils.encode_cell({ r: m.e.r, c: m.e.c }),
      })),
    }
  })

  return { format: "excel", filePath, sheets }
}

export const ExcelReadTool = Tool.define(
  "excel_read",
  Effect.succeed({
    description: `Read, extract, and inspect sheets, cells, rows, dimensions, sizes, and tabular data from an Excel workbook (.xlsx, .xls, .csv). ALWAYS invoke this tool first whenever a user asks to inspect, check sizes/dimensions, summarize, or read an Excel file. Returns all sheets, rowCount, colCount, and cell data instantly in-memory without spawning Python or shell scripts.`,
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
                  (f.endsWith(".xlsx") && f.toLowerCase().includes(baseName.toLowerCase().replace(".xlsx", ""))) ||
                  (f.endsWith(".xls") && f.toLowerCase().includes(baseName.toLowerCase().replace(".xls", ""))) ||
                  (f.endsWith(".csv") && f.toLowerCase().includes(baseName.toLowerCase().replace(".csv", ""))),
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
            title: "Excel read: file not found",
            output: `ERROR: ${params.filePath} not found in workspace (${baseDir})`,
            metadata: { cells: 0 },
          }
        }

        try {
          const map = buildExcelMap(filePath)
          return {
            title: `Excel read: ${path.basename(filePath)}`,
            output: JSON.stringify(map),
            metadata: { cells: map.sheets.reduce((n, s) => n + s.cells.length, 0) },
          }
        } catch (e) {
          recordNativeFailure(ctx?.sessionID, params.filePath)
          return { title: "Excel read failed", output: `ERROR: ${e}`, metadata: { cells: 0 } }
        }
      }),
  }),
)