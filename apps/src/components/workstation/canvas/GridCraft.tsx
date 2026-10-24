import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  ExternalLink,
  Search,
  Copy,
  Check,
  X,
  Layers,
  Plus,
  Save,
  Download,
  Sparkles,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTheme } from "../../../lib/theme";
import { useWordWrap } from "../../../lib/wordWrap";
import { useI18n } from "../../../lib/i18n";

export interface GridCraftProps {
  content: string;
  filePath?: string;
  title: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
}

export interface GridCellData {
  address: string;
  value: any;
  formatted: string;
  formula?: string;
  type?: string;
}

export interface GridSheetData {
  name: string;
  rowCount: number;
  colCount: number;
  colHeaders: string[]; // ['A', 'B', 'C', ...]
  rows: GridCellData[][];
}

/**
 * Robust Formula Evaluator for GridCraft:
 * Evaluates Excel formulas like =SUM(A1:A10), =AVERAGE(B2:B5), =COUNT(C1:C20), =MIN(D1:D4), =MAX(D1:D4)
 * and basic arithmetic expressions (+, -, *, /)
 */
function evaluateFormula(
  formula: string,
  getCellValue: (addr: string) => any
): { formatted: string; rawValue: any } {
  let clean = formula.trim();
  if (clean.startsWith("=")) clean = clean.substring(1).trim();
  if (!clean) return { formatted: "", rawValue: "" };

  try {
    // 1. Handle =SUM(A1:B10)
    const sumMatch = clean.match(/^SUM\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/i);
    if (sumMatch) {
      const range = XLSX.utils.decode_range(`${sumMatch[1].toUpperCase()}:${sumMatch[2].toUpperCase()}`);
      let sum = 0;
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const val = Number(getCellValue(addr));
          if (!isNaN(val)) sum += val;
        }
      }
      return { formatted: String(sum), rawValue: sum };
    }

    // 2. Handle =AVERAGE(A1:B10) or =AVG(A1:B10)
    const avgMatch = clean.match(/^(?:AVERAGE|AVG)\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/i);
    if (avgMatch) {
      const range = XLSX.utils.decode_range(`${avgMatch[1].toUpperCase()}:${avgMatch[2].toUpperCase()}`);
      let sum = 0;
      let count = 0;
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const val = Number(getCellValue(addr));
          if (!isNaN(val)) {
            sum += val;
            count++;
          }
        }
      }
      const avg = count > 0 ? sum / count : 0;
      const rounded = Math.round(avg * 100) / 100;
      return { formatted: String(rounded), rawValue: rounded };
    }

    // 3. Handle =COUNT(A1:B10)
    const countMatch = clean.match(/^COUNT\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/i);
    if (countMatch) {
      const range = XLSX.utils.decode_range(`${countMatch[1].toUpperCase()}:${countMatch[2].toUpperCase()}`);
      let count = 0;
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const val = getCellValue(addr);
          if (val !== null && val !== undefined && String(val).trim() !== "") {
            count++;
          }
        }
      }
      return { formatted: String(count), rawValue: count };
    }

    // 4. Handle =MIN(A1:B10) & =MAX(A1:B10)
    const minMaxMatch = clean.match(/^(MIN|MAX)\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/i);
    if (minMaxMatch) {
      const isMin = minMaxMatch[1].toUpperCase() === "MIN";
      const range = XLSX.utils.decode_range(`${minMaxMatch[2].toUpperCase()}:${minMaxMatch[3].toUpperCase()}`);
      let target = isMin ? Infinity : -Infinity;
      let found = false;
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const val = Number(getCellValue(addr));
          if (!isNaN(val)) {
            found = true;
            target = isMin ? Math.min(target, val) : Math.max(target, val);
          }
        }
      }
      const res = found ? target : 0;
      return { formatted: String(res), rawValue: res };
    }

    // 5. Arithmetic cell evaluation like =A1 + B1 or =B2 * 1.11
    const cellRefRegex = /\b([A-Z]+[0-9]+)\b/g;
    const sanitizedExpr = clean.replace(cellRefRegex, (match) => {
      const val = Number(getCellValue(match.toUpperCase()));
      return isNaN(val) ? "0" : String(val);
    });

    // Verify sanitized expression only contains numbers and basic arithmetic operators
    if (/^[0-9\s.+\-*/()%]+$/.test(sanitizedExpr)) {
      // Safe math evaluator via Function without scope leakage
      const computed = Function(`"use strict"; return (${sanitizedExpr});`)();
      const num = Number(computed);
      if (!isNaN(num)) {
        const rounded = Math.round(num * 100) / 100;
        return { formatted: String(rounded), rawValue: rounded };
      }
    }
  } catch {
    // If evaluation fails, fall back to displaying the raw formula
  }

  return { formatted: clean, rawValue: clean };
}

/**
 * GridCraft — Pure-Rust ArtCraft Document Suite In-App Interactive Spreadsheet Engine
 */
export function GridCraft({
  content,
  filePath,
  title,
  onContentChange,
  onSave,
}: GridCraftProps) {
  const { t } = useI18n();
  const { isLight } = useTheme();
  const { wordWrap } = useWordWrap();

  // Active Sheet and Selection State
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selectedCoord, setSelectedCoord] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editingValue, setEditingValue] = useState("");
  const [formulaBarValue, setFormulaBarValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live AI-to-Grid Synchronization highlight set
  const [aiHighlightedCells, setAiHighlightedCells] = useState<Set<string>>(new Set());
  const prevParsedContentRef = useRef<Record<string, Record<string, string>>>({});

  // Local workbook data structure allowing in-place edits and formula recalculations
  const [localSheets, setLocalSheets] = useState<GridSheetData[]>([]);
  const rawWorkbookRef = useRef<XLSX.WorkBook | null>(null);

  const inlineInputRef = useRef<HTMLInputElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Parse workbook from content prop
  useEffect(() => {
    if (!content || content.trim() === "" || content === "Empty document...") {
      setLocalSheets([]);
      return;
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
        setLocalSheets([]);
        return;
      }

      rawWorkbookRef.current = wb;

      // Extract sheets and detect live AI updates
      const currentCellMap: Record<string, Record<string, string>> = {};
      const newHighlighted = new Set<string>();

      const parsedSheets: GridSheetData[] = wb.SheetNames.map((sheetName) => {
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
        const maxCols = Math.max(range.e.c + 1, 8); // At least 8 columns for roomy view
        const maxRows = Math.max(range.e.r + 1, 15); // At least 15 rows for editing

        const colHeaders: string[] = [];
        for (let C = 0; C < maxCols; C++) {
          colHeaders.push(XLSX.utils.encode_col(C));
        }

        currentCellMap[sheetName] = {};

        const rows: GridCellData[][] = [];
        for (let R = 0; R < maxRows; R++) {
          const rowData: GridCellData[] = [];
          for (let C = 0; C < maxCols; C++) {
            const address = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[address];
            const formatted = cell?.w !== undefined ? String(cell.w) : cell?.v !== undefined ? String(cell.v) : "";
            const formula = cell?.f ? String(cell.f) : undefined;
            const value = cell?.v ?? null;

            currentCellMap[sheetName][address] = formatted;

            // Check if this cell value was changed by AI execution
            const prevSheet = prevParsedContentRef.current[sheetName];
            if (prevSheet && prevSheet[address] !== undefined && prevSheet[address] !== formatted && formatted !== "") {
              newHighlighted.add(address);
            }

            rowData.push({
              address,
              value,
              formatted,
              formula,
              type: cell?.t,
            });
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

      setLocalSheets(parsedSheets);
      prevParsedContentRef.current = currentCellMap;

      // If AI modified cells, trigger smooth pulse highlight that fades after 3 seconds
      if (newHighlighted.size > 0) {
        setAiHighlightedCells(newHighlighted);
        const timer = setTimeout(() => {
          setAiHighlightedCells(new Set());
        }, 3000);
        return () => clearTimeout(timer);
      }
    } catch (err) {
      console.error("[GridCraft] Failed to parse workbook:", err);
      setLocalSheets([]);
    }
  }, [content, title]);

  const activeSheet = localSheets[activeSheetIndex] || localSheets[0] || null;

  // Resolve current active cell
  const currentCell: GridCellData | null = useMemo(() => {
    if (!activeSheet || !activeSheet.rows[selectedCoord.r]) return null;
    return activeSheet.rows[selectedCoord.r][selectedCoord.c] || null;
  }, [activeSheet, selectedCoord]);

  // Sync formula bar value with selected cell
  useEffect(() => {
    if (currentCell) {
      const text = currentCell.formula ? `=${currentCell.formula}` : currentCell.formatted;
      setFormulaBarValue(text);
      if (!isEditingInline) {
        setEditingValue(text);
      }
    }
  }, [currentCell, isEditingInline]);

  // Focus inline input when editing begins
  useEffect(() => {
    if (isEditingInline && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [isEditingInline]);

  // Cell Value Getter for Formula Evaluation
  const getCellValueByAddress = useCallback(
    (addr: string) => {
      if (!activeSheet) return 0;
      for (const row of activeSheet.rows) {
        for (const cell of row) {
          if (cell.address === addr) {
            return cell.value ?? cell.formatted ?? 0;
          }
        }
      }
      return 0;
    },
    [activeSheet]
  );

  // Commit Cell Edit (called from inline editor or formula bar)
  const commitCellEdit = useCallback(
    (newValue: string) => {
      if (!activeSheet) return;
      const { r, c } = selectedCoord;
      const targetCell = activeSheet.rows[r]?.[c];
      if (!targetCell) return;

      let formula: string | undefined = undefined;
      let evaluatedFormatted = newValue;
      let evaluatedRawValue: any = newValue;

      if (newValue.startsWith("=")) {
        formula = newValue.substring(1);
        const evalRes = evaluateFormula(newValue, getCellValueByAddress);
        evaluatedFormatted = evalRes.formatted;
        evaluatedRawValue = evalRes.rawValue;
      } else {
        const num = Number(newValue);
        if (!isNaN(num) && newValue.trim() !== "") {
          evaluatedRawValue = num;
        }
      }

      // Update local sheet state
      setLocalSheets((prevSheets) => {
        const nextSheets = [...prevSheets];
        const sheet = { ...nextSheets[activeSheetIndex] };
        const rows = sheet.rows.map((row) => [...row]);

        rows[r][c] = {
          ...targetCell,
          value: evaluatedRawValue,
          formatted: evaluatedFormatted,
          formula,
        };

        sheet.rows = rows;
        nextSheets[activeSheetIndex] = sheet;
        return nextSheets;
      });

      // Update raw workbook and propagate changes to parent tab
      if (rawWorkbookRef.current) {
        const ws = rawWorkbookRef.current.Sheets[activeSheet.name];
        if (ws) {
          if (formula) {
            ws[targetCell.address] = { f: formula, v: evaluatedRawValue };
          } else {
            ws[targetCell.address] = { v: evaluatedRawValue, t: typeof evaluatedRawValue === "number" ? "n" : "s" };
          }

          // Serialize updated workbook to base64 or CSV
          const isCsv = (/\.(csv|tsv)$/i).test(title);
          let serialized: string;
          if (isCsv) {
            serialized = XLSX.utils.sheet_to_csv(ws);
          } else {
            serialized = XLSX.write(rawWorkbookRef.current, {
              type: "base64",
              bookType: "xlsx",
            });
          }

          onContentChange?.(serialized);
        }
      }

      setIsEditingInline(false);
    },
    [activeSheet, selectedCoord, activeSheetIndex, getCellValueByAddress, title, onContentChange]
  );

  // Keyboard navigation across spreadsheet cells
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!activeSheet) return;

      if (isEditingInline) {
        if (e.key === "Enter") {
          e.preventDefault();
          commitCellEdit(editingValue);
          // Move down after enter
          setSelectedCoord((prev) => ({
            r: Math.min(prev.r + 1, activeSheet.rows.length - 1),
            c: prev.c,
          }));
        } else if (e.key === "Escape") {
          e.preventDefault();
          setIsEditingInline(false);
          setEditingValue(currentCell?.formula ? `=${currentCell.formula}` : currentCell?.formatted || "");
        } else if (e.key === "Tab") {
          e.preventDefault();
          commitCellEdit(editingValue);
          setSelectedCoord((prev) => ({
            r: prev.r,
            c: e.shiftKey ? Math.max(prev.c - 1, 0) : Math.min(prev.c + 1, activeSheet.colHeaders.length - 1),
          }));
        }
        return;
      }

      // Normal navigation mode
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCoord((prev) => ({ r: Math.max(prev.r - 1, 0), c: prev.c }));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCoord((prev) => ({
          r: Math.min(prev.r + 1, activeSheet.rows.length - 1),
          c: prev.c,
        }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedCoord((prev) => ({ r: prev.r, c: Math.max(prev.c - 1, 0) }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedCoord((prev) => ({
          r: prev.r,
          c: Math.min(prev.c + 1, activeSheet.colHeaders.length - 1),
        }));
      } else if (e.key === "Tab") {
        e.preventDefault();
        setSelectedCoord((prev) => ({
          r: prev.r,
          c: e.shiftKey ? Math.max(prev.c - 1, 0) : Math.min(prev.c + 1, activeSheet.colHeaders.length - 1),
        }));
      } else if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        setIsEditingInline(true);
        setEditingValue(currentCell?.formula ? `=${currentCell.formula}` : currentCell?.formatted || "");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (onSave) {
          onSave();
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
        }
      }
    },
    [activeSheet, isEditingInline, editingValue, currentCell, commitCellEdit, onSave]
  );

  // Add new sheet to GridCraft workbook
  const handleAddNewSheet = useCallback(() => {
    if (!rawWorkbookRef.current) return;
    const newSheetName = `Sheet${localSheets.length + 1}`;
    const ws = XLSX.utils.aoa_to_sheet([[""]]);
    XLSX.utils.book_append_sheet(rawWorkbookRef.current, ws, newSheetName);

    const isCsv = (/\.(csv|tsv)$/i).test(title);
    if (!isCsv) {
      const serialized = XLSX.write(rawWorkbookRef.current, {
        type: "base64",
        bookType: "xlsx",
      });
      onContentChange?.(serialized);
    }

    setActiveSheetIndex(localSheets.length);
  }, [localSheets.length, title, onContentChange]);

  // Open physical file directly in native desktop Microsoft Excel companion
  const handleOpenNative = useCallback(async () => {
    if (!filePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openExcelNative) {
      await desktop.openExcelNative(filePath);
    } else if (desktop?.openPath) {
      await desktop.openPath(filePath);
    }
  }, [filePath]);

  // Copy current sheet as CSV to clipboard
  const handleCopySheetCsv = useCallback(() => {
    if (!rawWorkbookRef.current || !activeSheet) return;
    const ws = rawWorkbookRef.current.Sheets[activeSheet.name];
    if (!ws) return;
    const csv = XLSX.utils.sheet_to_csv(ws);
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeSheet]);

  // Export & Download current workbook as .xlsx
  const handleExportXlsx = useCallback(() => {
    if (!rawWorkbookRef.current) return;
    XLSX.writeFile(rawWorkbookRef.current, `${title.replace(/\.[^/.]+$/, "") || "workbook"}.xlsx`);
  }, [title]);

  const activeAddress = currentCell?.address || "A1";
  const query = searchQuery.trim().toLowerCase();

  if (!activeSheet) {
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
        <h3 className={cn("text-base font-semibold mb-2", isLight ? "text-slate-900" : "text-white")}>
          GridCraft — {title}
        </h3>
        <p className={cn("text-xs max-w-md mb-6 leading-relaxed", isLight ? "text-slate-500" : "text-[#71717a]")}>
          {t("spreadsheetBinaryNotice" as any, "Spreadsheet opened in GridCraft engine. You can edit cells, enter formulas, or launch in desktop Excel.")}
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

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "h-full w-full flex flex-col select-none overflow-hidden font-sans outline-none transition-colors",
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
        {/* Row 1: App Identity, Sheet details, Search & Actions */}
        <div
          className={cn(
            "flex items-center justify-between px-3 py-1.5 border-b gap-3 text-xs",
            isLight ? "border-slate-200" : "border-[#27272a]"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* GridCraft App Brand Badge */}
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-0.5 rounded font-semibold text-[11px] border transition-colors",
                isLight ? "bg-white border-slate-300 text-slate-900 shadow-2xs" : "bg-[#27272a] border-[#3f3f46]/60 text-white"
              )}
            >
              <FileSpreadsheet className={cn("w-3.5 h-3.5", isLight ? "text-slate-800" : "text-white")} />
              <span>GridCraft</span>
            </div>

            {/* Sheet Badge */}
            <div
              className={cn(
                "hidden sm:flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors",
                isLight ? "bg-white border-slate-200 text-slate-700 shadow-2xs" : "bg-[#222225] border-[#333336] text-zinc-300"
              )}
            >
              <span>{activeSheet.name}</span>
            </div>

            {/* Row & Col count */}
            <span className={cn("text-[11px] font-mono hidden md:inline", isLight ? "text-slate-500" : "text-[#71717a]")}>
              {activeSheet.rowCount} {t("rowsLabel", "rows")} × {activeSheet.colCount} {t("colsLabel", "cols")}
            </span>

            {/* AI Live Sync Status Indicator */}
            {aiHighlightedCells.size > 0 && (
              <div
                className={cn(
                  "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border animate-pulse transition-colors",
                  isLight ? "bg-white border-slate-400 text-slate-900 shadow-2xs" : "bg-[#27272a] border-zinc-500 text-white"
                )}
              >
                <Sparkles className="w-3 h-3 text-[#cf6613]" />
                <span>AI Live Updated ({aiHighlightedCells.size})</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Quick search */}
            <div className="relative flex items-center">
              <Search className={cn("w-3.5 h-3.5 absolute left-2", isLight ? "text-slate-400" : "text-[#71717a]")} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchInSheet", "Search cell...")}
                className={cn(
                  "pl-7 pr-6 py-1 rounded text-[11px] w-28 sm:w-36 md:w-44 outline-none transition-all border",
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

            {/* Save Button */}
            {onSave && (
              <button
                onClick={() => {
                  onSave();
                  setSaveSuccess(true);
                  setTimeout(() => setSaveSuccess(false), 2000);
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] transition-colors border cursor-pointer",
                  isLight
                    ? "bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 shadow-2xs"
                    : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
                )}
                title="Save spreadsheet changes (Ctrl+S)"
              >
                {saveSuccess ? (
                  <Check className={cn("w-3 h-3", isLight ? "text-slate-900" : "text-white")} />
                ) : (
                  <Save className={cn("w-3 h-3", isLight ? "text-slate-500" : "text-zinc-400")} />
                )}
                <span className="hidden lg:inline">{saveSuccess ? "Saved" : "Save"}</span>
              </button>
            )}

            {/* Export XLSX Button */}
            <button
              onClick={handleExportXlsx}
              className={cn(
                "hidden sm:flex items-center gap-1 px-2.5 py-1 rounded text-[11px] transition-colors border cursor-pointer",
                isLight
                  ? "bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 shadow-2xs"
                  : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
              )}
              title="Download as Excel (.xlsx)"
            >
              <Download className={cn("w-3 h-3", isLight ? "text-slate-500" : "text-zinc-400")} />
              <span className="hidden xl:inline">Export</span>
            </button>

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
              <span className="hidden lg:inline">{copied ? t("copiedCsv", "Copied") : t("copyCsv", "CSV")}</span>
            </button>

            {/* Dual-Mode Companion: Open in Native Excel */}
            <button
              onClick={handleOpenNative}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-all shadow-xs active:scale-95 cursor-pointer shrink-0",
                isLight ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-white hover:bg-zinc-200 text-black"
              )}
              title={t("openInExcelTooltip", "Open this document directly in native Microsoft Excel desktop application")}
            >
              <ExternalLink className={cn("w-3.5 h-3.5", isLight ? "text-white" : "text-black")} />
              <span>{t("openInExcel", "Native Excel")}</span>
            </button>
          </div>
        </div>

        {/* Row 2: GridCraft Interactive Formula Bar */}
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

          {/* Editable Formula Input Box */}
          <div className="flex-1 relative flex items-center">
            <input
              ref={formulaInputRef}
              type="text"
              value={formulaBarValue}
              onChange={(e) => setFormulaBarValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCellEdit(formulaBarValue);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setFormulaBarValue(currentCell?.formula ? `=${currentCell.formula}` : currentCell?.formatted || "");
                }
              }}
              placeholder="Enter value or formula (=SUM(A1:A10), =AVERAGE, =COUNT)..."
              className={cn(
                "w-full px-2.5 py-0.5 rounded border text-[11px] font-mono outline-none transition-colors",
                isLight
                  ? "bg-[#f8fafc] border-slate-200 focus:border-slate-500 text-slate-900 placeholder:text-slate-400"
                  : "bg-[#1a1a1d] border-[#27272a] focus:border-zinc-400 text-[#e4e4e7] placeholder:text-[#52525b]"
              )}
            />
          </div>
        </div>
      </div>

      {/* 2. SPREADSHEET TABLE GRID VIEW */}
      <div
        ref={tableContainerRef}
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
              {activeSheet.colHeaders.map((colHeader, cIdx) => {
                const isColActive = selectedCoord.c === cIdx;
                return (
                  <th
                    key={colHeader}
                    onClick={() => setSelectedCoord((prev) => ({ r: prev.r, c: cIdx }))}
                    className={cn(
                      "min-w-28 h-6 px-2 border-r border-b font-medium text-center select-none text-[11px] cursor-pointer transition-colors",
                      isColActive
                        ? isLight
                          ? "bg-slate-300 text-slate-950 font-bold border-b-2 border-slate-900"
                          : "bg-white/20 text-white font-bold border-b-2 border-white"
                        : isLight
                        ? "border-slate-200 bg-[#f1f5f9] text-slate-700 hover:bg-slate-200"
                        : "border-[#2e2e33] bg-[#1f1f23] text-[#a1a1aa] hover:bg-[#252529]"
                    )}
                  >
                    {colHeader}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Rows & Cells */}
          <tbody>
            {activeSheet.rows.map((row, rowIndex) => {
              const rowNum = rowIndex + 1;
              const isRowActive = selectedCoord.r === rowIndex;

              return (
                <tr key={rowNum} className={cn("transition-colors", isLight ? "hover:bg-slate-50" : "hover:bg-[#1a1a1e]")}>
                  {/* Sticky Row Number (1, 2, 3...) */}
                  <th
                    onClick={() => setSelectedCoord((prev) => ({ r: rowIndex, c: prev.c }))}
                    className={cn(
                      "sticky left-0 z-0 w-12 min-w-12 px-1.5 border-r border-b font-normal text-right select-none text-[11px] cursor-pointer transition-colors",
                      wordWrap ? "py-1 min-h-6" : "h-6",
                      isRowActive
                        ? isLight
                          ? "bg-slate-300 text-slate-950 font-bold"
                          : "bg-white/20 text-white font-bold"
                        : isLight
                        ? "border-slate-200 bg-[#f8fafc] text-slate-500 hover:bg-slate-200/60"
                        : "border-[#27272b] bg-[#1a1a1d] text-[#71717a] hover:bg-[#222226]"
                    )}
                  >
                    {rowNum}
                  </th>

                  {/* Row Cells */}
                  {row.map((cell, colIndex) => {
                    const isSelected = selectedCoord.r === rowIndex && selectedCoord.c === colIndex;
                    const isAiHighlighted = aiHighlightedCells.has(cell.address);
                    const isMatch = query && cell.formatted.toLowerCase().includes(query);
                    const isNumeric = typeof cell.value === "number" || (!isNaN(Number(cell.formatted)) && cell.formatted.trim() !== "");

                    return (
                      <td
                        key={cell.address}
                        onClick={() => {
                          setSelectedCoord({ r: rowIndex, c: colIndex });
                          setIsEditingInline(false);
                        }}
                        onDoubleClick={() => {
                          setSelectedCoord({ r: rowIndex, c: colIndex });
                          setIsEditingInline(true);
                          setEditingValue(cell.formula ? `=${cell.formula}` : cell.formatted);
                        }}
                        className={cn(
                          "px-2 border-r border-b transition-colors cursor-cell text-[12px] relative",
                          wordWrap
                            ? "whitespace-pre-wrap break-words py-1 min-h-[24px] max-w-sm"
                            : "h-6 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs",
                          isLight ? "border-slate-100" : "border-[#222225]",
                          isSelected
                            ? isLight
                              ? "bg-slate-100 text-slate-950 outline outline-2 outline-slate-900 z-1 font-medium shadow-xs"
                              : "bg-white/10 text-white outline outline-2 outline-white/80 z-1 font-medium shadow-xs"
                            : isAiHighlighted
                            ? isLight
                              ? "bg-slate-200 text-slate-950 font-bold animate-pulse"
                              : "bg-white/25 text-white font-bold animate-pulse"
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
                        {isSelected && isEditingInline ? (
                          <input
                            ref={inlineInputRef}
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => commitCellEdit(editingValue)}
                            className={cn(
                              "w-full h-full p-0 font-mono text-[12px] outline-none bg-transparent",
                              isNumeric ? "text-right" : "text-left",
                              isLight ? "text-slate-950" : "text-white"
                            )}
                          />
                        ) : (
                          cell.formatted
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. BOTTOM MULTI-SHEET TABS BAR & NEW SHEET BUTTON */}
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

        {localSheets.map((sheet, index) => {
          const isActive = index === activeSheetIndex;
          return (
            <button
              key={sheet.name}
              onClick={() => {
                setActiveSheetIndex(index);
                setSelectedCoord({ r: 0, c: 0 });
                setIsEditingInline(false);
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

        {/* Add New Sheet Button */}
        <button
          onClick={handleAddNewSheet}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors border cursor-pointer ml-1",
            isLight
              ? "bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200 shadow-2xs"
              : "bg-[#222225] hover:bg-[#2a2a2e] text-[#a1a1aa] hover:text-white border-[#333336]"
          )}
          title="Add a new blank sheet to workbook"
        >
          <Plus className="w-3 h-3" />
          <span>New Sheet</span>
        </button>
      </div>
    </div>
  );
}

// Backward-compatibility alias
export const SpreadsheetViewer = GridCraft;
