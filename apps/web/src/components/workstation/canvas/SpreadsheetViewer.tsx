import { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  ExternalLink,
  Search,
  Copy,
  Check,
  ShieldCheck,
  X,
  Layers,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTheme } from "../../../lib/theme";
import { useWordWrap } from "../../../lib/wordWrap";
import { useI18n } from "../../../lib/i18n";

interface SpreadsheetViewerProps {
  content: string;
  filePath?: string;
  title: string;
}

interface ParsedSheetData {
  name: string;
  rowCount: number;
  colCount: number;
  colHeaders: string[]; // ['A', 'B', 'C', ...]
  rows: Array<Array<{
    address: string;
    value: any;
    formatted: string;
    formula?: string;
    type?: string;
  }>>;
}

export function SpreadsheetViewer({ content, filePath, title }: SpreadsheetViewerProps) {
  const { t } = useI18n();
  const { isLight } = useTheme();
  const { wordWrap } = useWordWrap();
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{
    address: string;
    value: string;
    formula?: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // Parse workbook in-memory without modifying original file
  const parsedWorkbook = useMemo(() => {
    if (!content || content.trim() === "" || content === "Empty document...") {
      return null;
    }

    try {
      let wb: XLSX.WorkBook | null = null;
      const clean = content.trim();
      const isCsv = (/\.(csv|tsv)$/i).test(title);

      if (isCsv) {
        wb = XLSX.read(clean, { type: "string" });
      } else if (clean.startsWith("UEsDB") || /^[A-Za-z0-9+/=]{60,}/.test(clean.slice(0, 100))) {
        wb = XLSX.read(clean, {
          type: "base64",
          cellStyles: true,
          cellFormula: true,
          cellDates: true,
          cellNF: true,
        });
      } else if (clean.includes("|") && clean.includes("\n")) {
        // Markdown table parser: Convert markdown pipe table directly to interactive Excel grid
        const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
        const dataLines = tableLines.filter((l) => !(/^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(l)));
        const aoa = dataLines.map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
        if (aoa.length > 0) {
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Tabel");
        } else {
          wb = XLSX.read(clean, { type: "string" });
        }
      } else {
        wb = XLSX.read(clean, {
          type: "binary",
          cellStyles: true,
          cellFormula: true,
          cellDates: true,
          cellNF: true,
        });
      }

      if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        return null;
      }

      const sheets: ParsedSheetData[] = wb.SheetNames.map((sheetName) => {
        const ws = wb!.Sheets[sheetName];
        if (!ws || !ws["!ref"]) {
          return {
            name: sheetName,
            rowCount: 0,
            colCount: 0,
            colHeaders: [],
            rows: [],
          };
        }

        const range = XLSX.utils.decode_range(ws["!ref"]);
        const maxCols = Math.min(range.e.c + 1, 100);
        const maxRows = Math.min(range.e.r + 1, 1000);

        // Build column letter headers: A, B, C, ... AA, AB ...
        const colHeaders: string[] = [];
        for (let C = 0; C < maxCols; C++) {
          colHeaders.push(XLSX.utils.encode_col(C));
        }

        const rows: ParsedSheetData["rows"] = [];
        for (let R = 0; R < maxRows; R++) {
          const rowData: ParsedSheetData["rows"][0] = [];
          for (let C = 0; C < maxCols; C++) {
            const address = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[address];
            if (!cell) {
              rowData.push({
                address,
                value: null,
                formatted: "",
              });
            } else {
              const formatted = cell.w !== undefined ? String(cell.w) : (cell.v !== undefined ? String(cell.v) : "");
              rowData.push({
                address,
                value: cell.v,
                formatted,
                formula: cell.f ? String(cell.f) : undefined,
                type: cell.t,
              });
            }
          }
          rows.push(rowData);
        }

        return {
          name: sheetName,
          rowCount: rows.length,
          colCount: colHeaders.length,
          colHeaders,
          rows,
        };
      });

      return {
        sheets,
        rawWorkbook: wb,
      };
    } catch (err) {
      console.error("[SpreadsheetViewer] Failed to parse Excel buffer:", err);
      return null;
    }
  }, [content, title]);

  const activeSheet = parsedWorkbook?.sheets[activeSheetIndex] || parsedWorkbook?.sheets[0] || null;

  // Open physical file directly in native desktop Microsoft Excel / WPS Office
  const handleOpenNative = useCallback(async () => {
    if (!filePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openExcelNative) {
      await desktop.openExcelNative(filePath);
    } else if (desktop?.openPath) {
      await desktop.openPath(filePath);
    }
  }, [filePath]);

  // Export current sheet to CSV onto clipboard
  const handleCopySheetCsv = useCallback(() => {
    if (!parsedWorkbook?.rawWorkbook || !activeSheet) return;
    const ws = parsedWorkbook.rawWorkbook.Sheets[activeSheet.name];
    if (!ws) return;
    const csv = XLSX.utils.sheet_to_csv(ws);
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [parsedWorkbook, activeSheet]);

  const activeAddress = selectedCell?.address || (activeSheet?.rows[0]?.[0]?.address ?? "A1");
  const activeFormula = selectedCell?.formula
    ? `=${selectedCell.formula}`
    : selectedCell?.value ?? (activeSheet?.rows[0]?.[0]?.formatted ?? "");

  if (!parsedWorkbook || !activeSheet) {
    return (
      <div
        className={cn(
          "h-full w-full flex flex-col items-center justify-center p-8 text-center select-none font-sans transition-colors",
          isLight ? "bg-[#f8fafc] text-slate-600" : "bg-[#141416] text-[#a1a1aa]"
        )}
      >
        <div
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border transition-colors",
            isLight ? "bg-white border-slate-200 text-slate-800 shadow-xs" : "bg-white/5 border-white/10 text-white"
          )}
        >
          <FileSpreadsheet className="w-7 h-7" />
        </div>
        <h3 className={cn("text-base font-semibold mb-2", isLight ? "text-slate-900" : "text-white")}>{title}</h3>
        <p className={cn("text-xs max-w-md mb-6 leading-relaxed", isLight ? "text-slate-500" : "text-[#71717a]")}>
          {t("spreadsheetBinaryNotice", "Binary spreadsheet loaded. You can open it directly in desktop Microsoft Excel or verify its contents.")}
        </p>
        <button
          onClick={handleOpenNative}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all shadow-xs active:scale-95 cursor-pointer",
            isLight ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-white hover:bg-zinc-200 text-black"
          )}
        >
          <ExternalLink className="w-4 h-4" />
          {t("openInExcelNative", "Open in Microsoft Excel")}
        </button>
      </div>
    );
  }

  const query = searchQuery.trim().toLowerCase();

  return (
    <div
      className={cn(
        "h-full w-full flex flex-col select-none overflow-hidden font-sans transition-colors",
        isLight ? "bg-white text-slate-800" : "bg-[#141416] text-[#d4d4d8]"
      )}
    >
      {/* 1. TOP TOOLBAR & FORMULA BAR (MONOCHROME MINIMALIST) */}
      <div
        className={cn(
          "shrink-0 flex flex-col border-b transition-colors",
          isLight ? "border-slate-200 bg-[#f8fafc]" : "border-[#27272a] bg-[#18181b]"
        )}
      >
        {/* Row 1: Actions, Sheet details, Search */}
        <div
          className={cn(
            "flex items-center justify-between px-3 py-1.5 border-b gap-3 text-xs",
            isLight ? "border-slate-200" : "border-[#27272a]"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Sheet Badge */}
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-0.5 rounded font-medium text-[11px] border transition-colors",
                isLight ? "bg-white border-slate-200 text-slate-800 shadow-2xs" : "bg-[#27272a] border-[#3f3f46]/60 text-white"
              )}
            >
              <FileSpreadsheet className={cn("w-3.5 h-3.5", isLight ? "text-slate-500" : "text-zinc-400")} />
              <span>{activeSheet.name}</span>
            </div>

            {/* Row & Col count */}
            <span className={cn("text-[11px] font-mono hidden sm:inline", isLight ? "text-slate-500" : "text-[#71717a]")}>
              {activeSheet.rowCount} {t("rowsLabel", "rows")} × {activeSheet.colCount} {t("colsLabel", "cols")}
            </span>

            {/* Non-Destructive Badge */}
            <div
              className={cn(
                "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors",
                isLight ? "text-slate-600 bg-white border-slate-200 shadow-2xs" : "text-zinc-300 bg-[#222225] border-[#333336]"
              )}
              title={t("nonDestructiveEmbedTooltip", "File opened safely in memory (read-only) without modifying original Excel OOXML format.")}
            >
              <ShieldCheck className={cn("w-3 h-3", isLight ? "text-slate-500" : "text-zinc-400")} />
              <span className="hidden md:inline">Non-Destructive Embed</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick search */}
            <div className="relative flex items-center">
              <Search className={cn("w-3.5 h-3.5 absolute left-2", isLight ? "text-slate-400" : "text-[#71717a]")} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchInSheet", "Search in sheet...")}
                className={cn(
                  "pl-7 pr-6 py-1 rounded text-[11px] w-32 md:w-44 outline-none transition-all border",
                  isLight
                    ? "bg-white border-slate-200 focus:border-slate-500 text-slate-900 placeholder:text-slate-400 shadow-2xs"
                    : "bg-[#222225] border-[#333336] focus:border-zinc-400 text-white placeholder:text-[#71717a]"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className={cn("absolute right-1.5", isLight ? "text-slate-400 hover:text-slate-800" : "text-[#71717a] hover:text-white")}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Copy CSV Button */}
            <button
              onClick={handleCopySheetCsv}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] transition-colors border cursor-pointer",
                isLight
                  ? "bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 shadow-2xs"
                  : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
              )}
              title={t("copyCsvTooltip", "Copy this sheet content as CSV to clipboard")}
            >
              {copied ? (
                <Check className={cn("w-3 h-3", isLight ? "text-slate-900" : "text-white")} />
              ) : (
                <Copy className={cn("w-3 h-3", isLight ? "text-slate-500" : "text-zinc-400")} />
              )}
              <span className="hidden lg:inline">{copied ? t("copiedCsv", "Copied") : t("copyCsv", "Copy CSV")}</span>
            </button>

            {/* Open in Microsoft Excel Native Button (Monochrome High Contrast) */}
            <button
              onClick={handleOpenNative}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-all shadow-xs active:scale-95 cursor-pointer shrink-0",
                isLight ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-white hover:bg-zinc-200 text-black"
              )}
              title={t("openInExcelTooltip", "Open this document directly in native Microsoft Excel desktop application")}
            >
              <ExternalLink className={cn("w-3.5 h-3.5", isLight ? "text-white" : "text-black")} />
              <span>{t("openInExcel", "Open in Excel")}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Excel Formula / Address Bar */}
        <div
          className={cn(
            "flex items-center px-2.5 py-1 font-mono text-[12px] gap-2 border-b transition-colors",
            isLight ? "bg-white border-slate-200" : "bg-[#141416] border-[#27272a]"
          )}
        >
          {/* Active cell indicator (e.g. A1, H21) */}
          <div
            className={cn(
              "w-14 shrink-0 px-2 py-0.5 text-center font-bold rounded border transition-colors",
              isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-[#222225] border-[#333336] text-white"
            )}
          >
            {activeAddress}
          </div>
          <div className={cn("select-none font-sans italic text-[11px] font-semibold px-1", isLight ? "text-slate-400" : "text-[#71717a]")}>
            fx
          </div>
          {/* Formula or value content */}
          <div
            className={cn(
              "flex-1 px-2.5 py-0.5 rounded border truncate text-[11px] transition-colors",
              isLight ? "bg-[#f8fafc] border-slate-200 text-slate-900" : "bg-[#1a1a1d] border-[#27272a] text-[#e4e4e7]"
            )}
          >
            {activeFormula ? String(activeFormula) : <span className={cn("italic", isLight ? "text-slate-400" : "text-[#52525b]")}>{t("emptyCell", "Empty")}</span>}
          </div>
        </div>
      </div>

      {/* 2. SPREADSHEET TABLE GRID VIEW */}
      <div
        className={cn(
          "flex-1 overflow-auto relative scrollbar-thin transition-colors",
          isLight ? "bg-white scrollbar-thumb-slate-200 scrollbar-track-transparent" : "bg-[#141416] scrollbar-thumb-[#27272a] scrollbar-track-transparent"
        )}
      >
        <table className="border-collapse w-max min-w-full text-[12px] font-mono">
          {/* Sticky Column Headers (A, B, C...) */}
          <thead className={cn("sticky top-0 z-10", isLight ? "bg-[#f1f5f9]" : "bg-[#1f1f23]")}>
            <tr>
              {/* Top-left corner box */}
              <th
                className={cn(
                  "sticky left-0 z-20 w-12 min-w-12 h-6 border-r border-b font-normal text-center select-none text-[11px]",
                  isLight ? "border-slate-300 bg-[#e2e8f0] text-slate-600" : "border-[#2e2e33] bg-[#27272c] text-[#71717a]"
                )}
              >
                #
              </th>
              {activeSheet.colHeaders.map((colHeader) => (
                <th
                  key={colHeader}
                  className={cn(
                    "min-w-28 h-6 px-2 border-r border-b font-medium text-center select-none text-[11px]",
                    isLight ? "border-slate-200 bg-[#f1f5f9] text-slate-700" : "border-[#2e2e33] bg-[#1f1f23] text-[#a1a1aa]"
                  )}
                >
                  {colHeader}
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Rows & Cells */}
          <tbody>
            {activeSheet.rows.map((row, rowIndex) => {
              const rowNum = rowIndex + 1;
              return (
                <tr key={rowNum} className={cn("transition-colors", isLight ? "hover:bg-slate-50" : "hover:bg-[#1a1a1e]")}>
                  {/* Sticky Row Number (1, 2, 3...) */}
                  <th
                    className={cn(
                      "sticky left-0 z-0 w-12 min-w-12 px-1.5 border-r border-b font-normal text-right select-none text-[11px]",
                      wordWrap ? "py-1 min-h-6" : "h-6",
                      isLight ? "border-slate-200 bg-[#f8fafc] text-slate-500" : "border-[#27272b] bg-[#1a1a1d] text-[#71717a]"
                    )}
                  >
                    {rowNum}
                  </th>

                  {/* Row Cells */}
                  {row.map((cell) => {
                    const isSelected = selectedCell?.address === cell.address;
                    const isMatch = query && cell.formatted.toLowerCase().includes(query);
                    const isNumeric = typeof cell.value === "number" || (!isNaN(Number(cell.formatted)) && cell.formatted.trim() !== "");

                    return (
                      <td
                        key={cell.address}
                        onClick={() =>
                          setSelectedCell({
                            address: cell.address,
                            value: cell.formatted,
                            formula: cell.formula,
                          })
                        }
                        className={cn(
                          "px-2 border-r border-b transition-colors cursor-cell text-[12px]",
                          wordWrap
                            ? "whitespace-pre-wrap break-words py-1 min-h-[24px] max-w-sm"
                            : "h-6 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs",
                          isLight ? "border-slate-100" : "border-[#222225]",
                          isSelected
                            ? isLight
                              ? "bg-slate-100 text-slate-950 outline outline-2 outline-slate-900 z-1 font-medium"
                              : "bg-white/10 text-white outline outline-2 outline-white/80 z-1"
                            : isMatch
                            ? isLight
                              ? "bg-slate-200 text-slate-950 font-semibold"
                              : "bg-zinc-700 text-white font-medium"
                            : isLight
                            ? "text-slate-800"
                            : "text-[#d4d4d8]",
                          isNumeric ? "text-right" : "text-left"
                        )}
                        title={`${cell.address}: ${cell.formula ? `=${cell.formula}` : cell.formatted}`}
                      >
                        {cell.formatted}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. BOTTOM MULTI-SHEET TABS BAR (MONOCHROME MINIMALIST) */}
      {parsedWorkbook.sheets.length > 0 && (
        <div
          className={cn(
            "shrink-0 flex items-center px-2 py-1 border-t gap-1 overflow-x-auto select-none transition-colors",
            isLight ? "bg-[#f8fafc] border-slate-200" : "bg-[#18181b] border-[#27272a]"
          )}
        >
          <div className={cn("flex items-center gap-1 text-[11px] px-2 py-0.5 font-medium", isLight ? "text-slate-500" : "text-[#71717a]")}>
            <Layers className="w-3 h-3" />
            <span>{t("sheetsLabel", "Sheets:")}</span>
          </div>
          {parsedWorkbook.sheets.map((sheet, index) => {
            const isActive = index === activeSheetIndex;
            return (
              <button
                key={sheet.name}
                onClick={() => {
                  setActiveSheetIndex(index);
                  setSelectedCell(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer",
                  isActive
                    ? isLight
                      ? "bg-white text-slate-900 border-b-2 border-slate-900 shadow-xs font-semibold"
                      : "bg-[#27272a] text-white border-b-2 border-white shadow-xs font-semibold"
                    : isLight
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                    : "text-[#888888] hover:text-white hover:bg-[#202023]"
                )}
              >
                <FileSpreadsheet className={cn("w-3 h-3", isLight ? "text-slate-500" : "text-zinc-400")} />
                <span>{sheet.name}</span>
                <span className={cn("text-[10px]", isLight ? "text-slate-400" : "text-[#71717a]")}>({sheet.rowCount})</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
