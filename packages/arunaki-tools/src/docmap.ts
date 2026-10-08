import { Schema } from "effect"

// ============================================================
// Document Map Schema — ground truth hasil parser (read tools)
// Diproduksi oleh read tools, dikonsumsi LLM untuk menarget edit
// tools (COM) via koordinat yang pasti, bukan fuzzy label.
// ============================================================

export class ExcelCell extends Schema.Class<ExcelCell>("ExcelCell")({
  ref: Schema.String, // koordinat A1, contoh "B3"
  value: Schema.optional(Schema.NullishOr(Schema.Unknown)), // nilai mentah (v)
  text: Schema.optional(Schema.NullishOr(Schema.String)), // tampilan terformat (w)
  type: Schema.optional(Schema.NullishOr(Schema.String)), // tipe xlsx: s|n|d|b|e|str
  formula: Schema.optional(Schema.NullishOr(Schema.String)), // kehadiran rumus (f)
}) {}

export class ExcelMerge extends Schema.Class<ExcelMerge>("ExcelMerge")({
  anchor: Schema.String, // sel kiri-atas gabungan
  end: Schema.String, // sel kanan-bawah gabungan
}) {}

export class ExcelSheet extends Schema.Class<ExcelSheet>("ExcelSheet")({
  name: Schema.String,
  range: Schema.optional(Schema.NullishOr(Schema.String)), // ref area isi, contoh "A1:F40"
  rowCount: Schema.Number,
  colCount: Schema.Number,
  cells: Schema.Array(ExcelCell),
  merges: Schema.Array(ExcelMerge),
}) {}

export class ExcelMap extends Schema.Class<ExcelMap>("ExcelMap")({
  format: Schema.Literal("excel"),
  filePath: Schema.String,
  sheets: Schema.Array(ExcelSheet),
}) {}

export class WordParagraph extends Schema.Class<WordParagraph>("WordParagraph")({
  index: Schema.Number, // 1-indexed
  text: Schema.String,
}) {}

export class WordTable extends Schema.Class<WordTable>("WordTable")({
  index: Schema.Number, // 1-indexed, urutan tabel dalam dokumen
  rows: Schema.Array(Schema.Array(Schema.String)),
}) {}

export class WordMap extends Schema.Class<WordMap>("WordMap")({
  format: Schema.Literal("word"),
  filePath: Schema.String,
  paragraphs: Schema.Array(WordParagraph),
  tables: Schema.Array(WordTable),
}) {}

export class PptShape extends Schema.Class<PptShape>("PptShape")({
  id: Schema.Number, // id shape dari ppt/slides XML
  name: Schema.optional(Schema.NullishOr(Schema.String)),
  text: Schema.optional(Schema.NullishOr(Schema.String)),
}) {}

export class PptSlide extends Schema.Class<PptSlide>("PptSlide")({
  number: Schema.Number, // 1-indexed
  shapes: Schema.Array(PptShape),
}) {}

export class PptMap extends Schema.Class<PptMap>("PptMap")({
  format: Schema.Literal("ppt"),
  filePath: Schema.String,
  slides: Schema.Array(PptSlide),
}) {}

export class PdfPage extends Schema.Class<PdfPage>("PdfPage")({
  number: Schema.Number, // 1-indexed
  text: Schema.String,
}) {}

export class PdfMap extends Schema.Class<PdfMap>("PdfMap")({
  format: Schema.Literal("pdf"),
  filePath: Schema.String,
  pageCount: Schema.Number,
  isScanned: Schema.Boolean,
  text: Schema.String,
  pages: Schema.Array(PdfPage),
  info: Schema.optional(Schema.NullishOr(Schema.Record(Schema.String, Schema.Unknown))),
}) {}

export class ImageOcrLine extends Schema.Class<ImageOcrLine>("ImageOcrLine")({
  lineNumber: Schema.Number,
  text: Schema.String,
}) {}

export class ImageOcrMap extends Schema.Class<ImageOcrMap>("ImageOcrMap")({
  format: Schema.Literal("ocr"),
  filePath: Schema.String,
  confidence: Schema.Number,
  text: Schema.String,
  lines: Schema.Array(ImageOcrLine),
}) {}

export const DocMap = Schema.Union([ExcelMap, WordMap, PptMap, PdfMap, ImageOcrMap])
export type DocMap = typeof DocMap.Type

// ============================================================
// Edit target — cara COM tools menunjuk sasaran EDITS via peta.
// LLM membaca map terlebih dahulu, lalu menembak ref/indeks
// eksplisit di sini (bukan pencarian label fuzzy).
// ============================================================

export class ExcelWriteCell extends Schema.Class<ExcelWriteCell>("ExcelWriteCell")({
  sheet: Schema.optional(Schema.NullishOr(Schema.String)),
  ref: Schema.String, // dari peta, contoh "B3"
  value: Schema.optional(Schema.NullishOr(Schema.Unknown)),
}) {}

export class WordTarget extends Schema.Class<WordTarget>("WordTarget")({
  kind: Schema.Literals(["paragraph", "table"]),
  index: Schema.Number, // dari peta
}) {}