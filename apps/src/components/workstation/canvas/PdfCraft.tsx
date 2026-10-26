import { useState, useMemo, useCallback, useEffect } from "react";
import {
  FileText,
  Table,
  Search,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  Printer,
  Sparkles,
  ArrowUpRight,
  Layers,
  Code2,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTheme } from "../../../lib/theme";

export interface PdfBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfExtractedTable {
  index: number;
  bbox: PdfBoundingBox;
  headers: string[];
  rows: string[][];
}

export interface PdfPageData {
  number: number;
  text: string;
  tables?: PdfExtractedTable[];
}

export interface PdfCraftProps {
  content: string;
  filePath?: string;
  title: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
  onSendToGridCraft?: (tableData: { headers: string[]; rows: string[][] }, suggestedName: string) => void;
}

type ViewMode = "cartographer" | "data" | "text";

export function PdfCraft({
  content,
  filePath,
  title,
  onSendToGridCraft,
}: PdfCraftProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  // 1. ALL HOOKS STRICTLY AT TOP LEVEL
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [viewMode, setViewMode] = useState<ViewMode>("cartographer");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTableIdx, setSelectedTableIdx] = useState<number | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<{
    pageCount: number;
    isScanned: boolean;
    text: string;
    pages: PdfPageData[];
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isGridCraftSent, setIsGridCraftSent] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Parse tables fallback from raw text if needed
  const fallbackPages = useMemo<PdfPageData[]>(() => {
    if (!content) {
      return [
        {
          number: 1,
          text: "Document content is empty or loading...",
          tables: [],
        },
      ];
    }
    const lines = content.split("\n");
    const sampleRows: string[][] = [];
    const headers: string[] = [];
    let inTable = false;

    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed.includes("|")) {
        const parts = trimmed
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length >= 2) {
          if (!inTable) {
            headers.push(...parts);
            inTable = true;
          } else if (!parts.every((p) => p.includes("-") || p.includes("="))) {
            sampleRows.push(parts);
          }
        }
      }
    }

    const detectedTables: PdfExtractedTable[] = [];
    if (sampleRows.length > 0) {
      detectedTables.push({
        index: 1,
        bbox: { x: 8, y: 25, width: 84, height: Math.min(50, 15 + sampleRows.length * 5) },
        headers: headers.length > 0 ? headers : ["Column 1", "Column 2", "Column 3"],
        rows: sampleRows,
      });
    }

    return [
      {
        number: 1,
        text: content,
        tables: detectedTables,
      },
    ];
  }, [content]);

  // Read binary PDF data & parse structure via backend Pure-Rust engine
  useEffect(() => {
    if (!filePath) return;
    setIsLoading(true);

    // Fetch base64 data for embedded PDF rendering
    fetch("http://127.0.0.1:4096/api/desktop/read-binary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.base64) {
          setPdfBase64(data.base64);
        }
      })
      .catch(() => {});

    // Fetch parsed structure (text, bounding-box overlays, tables)
    fetch("http://127.0.0.1:4096/api/desktop/parse-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    })
      .then((res) => res.json())
      .then((json) => {
        setIsLoading(false);
        if (json.success && json.data) {
          setPdfData(json.data);
          if (json.data.pageCount) {
            setTotalPages(Math.max(1, json.data.pageCount));
          }
        }
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [filePath]);

  const activePages = pdfData?.pages && pdfData.pages.length > 0 ? pdfData.pages : fallbackPages;
  const activePageData = activePages.find((p) => p.number === currentPage) || activePages[0];
  const activeTables = activePageData?.tables || [];

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(200, prev + 15));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(50, prev - 15));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(100);
  }, []);

  const handleOpenNative = async () => {
    if (!filePath) return;
    try {
      if ((window as any).arunakiDesktop?.openPath) {
        await (window as any).arunakiDesktop.openPath(filePath);
      } else {
        await fetch("http://127.0.0.1:4096/api/desktop/open-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath }),
        });
      }
    } catch {}
  };

  const handleSendToGridCraft = useCallback(async (table: PdfExtractedTable) => {
    if (onSendToGridCraft) {
      onSendToGridCraft(
        { headers: table.headers, rows: table.rows },
        `rekap-${title.replace(/\.[^/.]+$/, "")}-tabel-${table.index}.xlsx`
      );
    } else {
      // Direct call to write-excel endpoint
      try {
        const fullRows = [table.headers, ...table.rows];
        const outPath = (filePath || "document.pdf").replace(/\.pdf$/i, "-rekap.xlsx");
        await fetch("http://127.0.0.1:4096/api/desktop/write-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePath: outPath,
            rows: fullRows,
            sheetName: `Tabel-${table.index}`,
          }),
        });
      } catch {}
    }
    setIsGridCraftSent(true);
    setTimeout(() => setIsGridCraftSent(false), 3000);
  }, [filePath, title, onSendToGridCraft]);

  const handleCopyTable = useCallback((table: PdfExtractedTable) => {
    const tsv = [table.headers.join("\t"), ...table.rows.map((r) => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Filter text with search query
  const highlightedPageText = useMemo(() => {
    const raw = activePageData?.text || "";
    if (!searchQuery.trim()) return raw;
    return raw;
  }, [activePageData, searchQuery]);

  return (
    <div
      className={cn(
        "flex-1 flex flex-col h-full overflow-hidden select-none font-sans transition-colors duration-150",
        isLight ? "bg-[#f1f3f5] text-slate-900" : "bg-[#121214] text-[#ececed]"
      )}
    >
      {/* 1. TOP HEADER TOOLBAR */}
      <div
        className={cn(
          "h-11 px-3 border-b flex items-center justify-between gap-2 shrink-0 select-none z-10 transition-colors",
          isLight ? "bg-white border-slate-200" : "bg-[#18181b] border-[#27272a]"
        )}
      >
        {/* Left: App Branding & File Tag */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border tracking-wider uppercase shrink-0",
              isLight
                ? "bg-slate-100 text-slate-800 border-slate-200"
                : "bg-[#27272a] text-white border-[#3f3f46]"
            )}
          >
            <FileText className="w-3.5 h-3.5 text-white" />
            <span>PDFCRAFT</span>
          </div>

          <span className="text-xs font-medium truncate max-w-[180px] sm:max-w-[260px] text-[var(--text-main)]">
            {title}
          </span>

          {activeTables.length > 0 && (
            <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border border-[#cf6613]/30 bg-[#cf6613]/10 text-[#cf6613]">
              <Sparkles className="w-3 h-3" />
              <span>{activeTables.length} Table{activeTables.length > 1 ? "s" : ""} Extracted</span>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>Parsing...</span>
            </div>
          )}
        </div>

        {/* Center: Page Navigation & Zoom */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Page Selector */}
          <div className="flex items-center gap-1 bg-[var(--bg-hover)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="p-1 hover:text-white text-zinc-400 disabled:opacity-30 cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="p-1 hover:text-white text-zinc-400 disabled:opacity-30 cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="hidden lg:flex items-center gap-0.5 bg-[var(--bg-hover)] px-1 py-0.5 rounded border border-[var(--border-color)]">
            <button
              onClick={handleZoomOut}
              className="p-1 hover:text-white text-zinc-400 cursor-pointer"
              title="Zoom Out (-15%)"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={handleResetZoom}
              className="text-[10px] font-mono px-1.5 hover:text-white cursor-pointer"
              title="Reset Zoom"
            >
              {zoomLevel}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 hover:text-white text-zinc-400 cursor-pointer"
              title="Zoom In (+15%)"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right: Mode Switcher & Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View Mode Switcher */}
          <div className="flex items-center rounded border border-[var(--border-color)] overflow-hidden bg-[var(--bg-hover)] p-0.5 text-[11px]">
            <button
              onClick={() => setViewMode("cartographer")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition-all",
                viewMode === "cartographer"
                  ? isLight
                    ? "bg-white text-black font-semibold shadow-2xs"
                    : "bg-[#27272a] text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Visual Cartographer: PDF page with interactive table bounding boxes"
            >
              <Layers className="w-3 h-3" />
              <span className="hidden xl:inline">Cartographer</span>
            </button>

            <button
              onClick={() => setViewMode("data")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition-all",
                viewMode === "data"
                  ? isLight
                    ? "bg-white text-black font-semibold shadow-2xs"
                    : "bg-[#27272a] text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Structured Data: Extracted table data grid"
            >
              <Table className="w-3 h-3" />
              <span className="hidden xl:inline">Tables ({activeTables.length})</span>
            </button>

            <button
              onClick={() => setViewMode("text")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition-all",
                viewMode === "text"
                  ? isLight
                    ? "bg-white text-black font-semibold shadow-2xs"
                    : "bg-[#27272a] text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Raw Extracted Stream Text"
            >
              <Code2 className="w-3 h-3" />
              <span className="hidden xl:inline">Text</span>
            </button>
          </div>

          {/* Quick Action: Send to GridCraft */}
          {activeTables.length > 0 && (
            <button
              onClick={() => handleSendToGridCraft(activeTables[0])}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition-all cursor-pointer shadow-xs active:scale-95 shrink-0",
                isGridCraftSent
                  ? "bg-white text-black border-white"
                  : isLight
                  ? "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                  : "bg-white hover:bg-zinc-200 text-black border-white"
              )}
              title="Kirim tabel PDF yang diekstrak langsung ke GridCraft Spreadsheet"
            >
              {isGridCraftSent ? (
                <>
                  <Check className="w-3.5 h-3.5 text-black" />
                  <span>Terkirim ke GridCraft</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className={cn("w-3.5 h-3.5", isLight ? "text-white" : "text-black")} />
                  <span>Send to GridCraft</span>
                </>
              )}
            </button>
          )}

          {/* Print PDF */}
          <button
            onClick={() => window.print()}
            className={cn(
              "p-1.5 rounded border cursor-pointer transition-colors",
              isLight
                ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
            )}
            title="Print PDF"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>

          {/* Dual-Mode Companion: Open in Default System PDF Reader */}
          <button
            onClick={handleOpenNative}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors shrink-0",
              isLight
                ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
            )}
            title="Open in default system PDF reader (Adobe / Edge)"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden xl:inline">Open External</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE WITH THUMBNAILS & VIEWPORT */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
        {/* Left: Thumbnail & Outline Strip */}
        <div
          className={cn(
            "w-48 sm:w-56 shrink-0 border-r flex flex-col p-3 gap-3 overflow-y-auto select-none scrollbar-thin transition-colors",
            isLight ? "bg-[#f8fafc] border-slate-200" : "bg-[#141416] border-[#222225]"
          )}
        >
          <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase px-1">
            Pages ({totalPages})
          </div>

          {activePages.map((p) => {
            const isActive = p.number === currentPage;
            const tableCount = p.tables?.length || 0;
            return (
              <div
                key={p.number}
                onClick={() => setCurrentPage(p.number)}
                className={cn(
                  "p-2.5 rounded border text-left cursor-pointer transition-all flex flex-col gap-1.5",
                  isActive
                    ? isLight
                      ? "bg-white border-slate-900 shadow-xs"
                      : "bg-[#1f1f23] border-white text-white shadow-xs"
                    : isLight
                    ? "bg-white/60 hover:bg-white border-slate-200 text-slate-600"
                    : "bg-[#18181b]/60 hover:bg-[#18181b] border-[#27272a] text-zinc-400"
                )}
              >
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span>Page {p.number}</span>
                  {tableCount > 0 && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border border-[#cf6613]/40 bg-[#cf6613]/10 text-[#cf6613]">
                      {tableCount} table{tableCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Mini page representation */}
                <div
                  className={cn(
                    "h-24 w-full rounded-sm border p-2 flex flex-col justify-between overflow-hidden text-[8px] font-mono leading-tight",
                    isLight ? "bg-white border-slate-200 text-slate-400" : "bg-[#0f0f11] border-[#222225] text-zinc-500"
                  )}
                >
                  <div className="line-clamp-4">{p.text || "[Scanned or image page]"}</div>
                  <div className="text-[7px] text-right text-zinc-400">P.{p.number}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center / Right: Dynamic Viewport based on ViewMode */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative">
          {/* SEARCH OVERLAY (Optional) */}
          <div
            className={cn(
              "h-8 px-4 border-b flex items-center justify-between gap-3 text-xs shrink-0 transition-colors",
              isLight ? "bg-white/70 border-slate-200" : "bg-[#18181b]/70 border-[#27272a]"
            )}
          >
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <input
                type="text"
                placeholder="Search text in page..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-[11px] outline-hidden w-full text-[var(--text-main)] placeholder:text-zinc-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="text-[10px] font-mono text-zinc-400">
              Visual Data Cartographer: {activeTables.length} table regions detected
            </div>
          </div>

          {/* VIEW MODE 1: VISUAL CARTOGRAPHER (PDF PAGE + BOUNDING BOX OVERLAY) */}
          {viewMode === "cartographer" && (
            <div className="flex-1 flex items-start justify-center p-6 overflow-auto scrollbar-thin bg-[var(--bg-app)]">
              <div
                style={{
                  width: `${(794 * zoomLevel) / 100}px`,
                  minHeight: `${(1123 * zoomLevel) / 100}px`,
                }}
                className={cn(
                  "relative rounded-sm shadow-xl transition-all duration-100 flex flex-col border",
                  isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#1c1c1f] border-[#2e2e33] text-[#f4f4f5]"
                )}
              >
                {/* Embedded PDF iframe or structured visual page */}
                {pdfBase64 ? (
                  <iframe
                    src={`data:application/pdf;base64,${pdfBase64}#page=${currentPage}&toolbar=0&navpanes=0`}
                    className="w-full h-full min-h-[1050px] border-none rounded-sm pointer-events-auto"
                    title={`PDF Page ${currentPage}`}
                  />
                ) : (
                  <div className="p-12 font-serif text-[13px] leading-relaxed select-text whitespace-pre-wrap">
                    <div className="border-b pb-4 mb-6 flex justify-between items-center text-xs text-slate-400 font-sans">
                      <span>DOCUMENT PAGE {currentPage}</span>
                      <span>{title}</span>
                    </div>
                    {highlightedPageText}
                  </div>
                )}

                {/* BOUNDING BOX OVERLAY CARTOGRAPHER */}
                {activeTables.map((tbl, idx) => {
                  const isSelected = selectedTableIdx === idx;
                  return (
                    <div
                      key={tbl.index}
                      onClick={() => setSelectedTableIdx(isSelected ? null : idx)}
                      style={{
                        position: "absolute",
                        left: `${tbl.bbox.x}%`,
                        top: `${tbl.bbox.y}%`,
                        width: `${tbl.bbox.width}%`,
                        height: `${tbl.bbox.height}%`,
                      }}
                      className={cn(
                        "rounded border-2 transition-all cursor-pointer group flex flex-col justify-between p-2 z-20 pointer-events-auto",
                        isSelected
                          ? "border-[#cf6613] bg-[#cf6613]/15 shadow-lg shadow-[#cf6613]/10"
                          : "border-[#cf6613]/70 bg-[#cf6613]/5 hover:bg-[#cf6613]/10 hover:border-[#cf6613]"
                      )}
                      title="Klik untuk membuka data tabel di inspector"
                    >
                      {/* Top Tag Header */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#18181b]/90 text-white border border-[#3f3f46] shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#cf6613] animate-ping" />
                          <span>
                            Table #{tbl.index} • {tbl.headers.length} cols × {tbl.rows.length} rows
                          </span>
                        </div>

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendToGridCraft(tbl);
                            }}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white text-black hover:bg-zinc-200 shadow-xs cursor-pointer flex items-center gap-1"
                          >
                            <ArrowUpRight className="w-3 h-3" />
                            <span>Excel</span>
                          </button>
                        </div>
                      </div>

                      {/* Bottom hint */}
                      <div className="text-[9px] font-mono text-zinc-400 bg-black/60 px-1.5 py-0.5 rounded self-start opacity-0 group-hover:opacity-100 transition-opacity">
                        AI Visual Extractor Region
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW MODE 2: STRUCTURED TABLE DATA */}
          {viewMode === "data" && (
            <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-auto scrollbar-thin">
              {activeTables.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                  <Table className="w-8 h-8 mb-2 opacity-40 text-white" />
                  <div className="text-sm font-semibold text-[var(--text-main)]">Tidak ada tabel terdeteksi di halaman ini</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Gunakan mode "Text" untuk melihat seluruh baris data teks mentah dokumen.
                  </div>
                </div>
              ) : (
                activeTables.map((tbl) => (
                  <div
                    key={tbl.index}
                    className={cn(
                      "rounded border flex flex-col overflow-hidden shadow-xs",
                      isLight ? "bg-white border-slate-200" : "bg-[#18181b] border-[#27272a]"
                    )}
                  >
                    {/* Table Title Bar */}
                    <div
                      className={cn(
                        "px-4 py-2.5 border-b flex items-center justify-between gap-3 text-xs",
                        isLight ? "bg-slate-50 border-slate-200" : "bg-[#202024] border-[#2a2a2e]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Table className="w-4 h-4 text-white" />
                        <span className="font-semibold text-[var(--text-main)]">
                          Table #{tbl.index} ({tbl.headers.length} Columns × {tbl.rows.length} Rows)
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyTable(tbl)}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border cursor-pointer transition-colors",
                            isLight
                              ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                              : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] border-[#3f3f46]/50"
                          )}
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copied ? "Copied" : "Copy TSV"}</span>
                        </button>

                        <button
                          onClick={() => handleSendToGridCraft(tbl)}
                          className={cn(
                            "flex items-center gap-1 px-3 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer shadow-xs",
                            isLight ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-white hover:bg-zinc-200 text-black"
                          )}
                        >
                          <ArrowUpRight className={cn("w-3.5 h-3.5", isLight ? "text-white" : "text-black")} />
                          <span>Send to GridCraft</span>
                        </button>
                      </div>
                    </div>

                    {/* Table Data View */}
                    <div className="overflow-x-auto scrollbar-thin max-h-96">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className={cn("border-b", isLight ? "bg-slate-100 border-slate-200 text-slate-700" : "bg-[#1c1c20] border-[#27272a] text-zinc-300")}>
                            {tbl.headers.map((h, i) => (
                              <th key={i} className="px-3 py-2 font-semibold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)] font-mono text-[11px]">
                          {tbl.rows.map((r, rIdx) => (
                            <tr
                              key={rIdx}
                              className={cn(
                                "hover:bg-[var(--bg-hover)] transition-colors",
                                rIdx % 2 === 1 ? (isLight ? "bg-slate-50/50" : "bg-[#151518]/50") : ""
                              )}
                            >
                              {r.map((c, cIdx) => (
                                <td key={cIdx} className="px-3 py-2 whitespace-nowrap">
                                  {c}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* VIEW MODE 3: RAW EXTRACTED TEXT */}
          {viewMode === "text" && (
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
              <div
                className={cn(
                  "flex-1 p-4 rounded border font-mono text-xs overflow-auto whitespace-pre-wrap select-text scrollbar-thin leading-relaxed",
                  isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#161619] border-[#27272a] text-zinc-300"
                )}
              >
                {activePageData?.text || "[No selectable stream text available]"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PdfCraft;
