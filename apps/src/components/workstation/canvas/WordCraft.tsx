import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  FileText,
  Printer,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Type,
  Check,
  Copy,
  Sparkles,
  BookOpen,
  Save,
  Edit3,
  Eye,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTheme } from "../../../lib/theme";

export interface WordCraftProps {
  content: string;
  filePath?: string;
  title: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
}

interface ParsedWordDoc {
  paragraphs: string[];
  tables: string[][][];
}

/**
 * WordCraft — Official Pure-Rust ArtCraft Document Suite Rich A4 Canvas Engine
 */
export function WordCraft({
  content,
  filePath,
  title,
  onContentChange,
  onSave,
}: WordCraftProps) {
  const { isLight } = useTheme();

  // View Settings State
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [fontFamily, setFontFamily] = useState<"serif" | "sans">("serif");
  const [viewMode, setViewMode] = useState<"paged" | "flow">("paged");
  const [isEditorMode, setIsEditorMode] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Live AI Revision Diff State
  const prevContentRef = useRef<string>(content);
  const [diffAddedCount, setDiffAddedCount] = useState<number>(0);

  // Local editing text state
  const [localText, setLocalText] = useState<string>(content);
  const [parsedDoc, setParsedDoc] = useState<ParsedWordDoc | null>(null);

  // Sync content prop to local text
  useEffect(() => {
    if (content !== localText) {
      if (prevContentRef.current && content !== prevContentRef.current) {
        // AI updated the document, count changes
        const prevLines = prevContentRef.current.split("\n");
        const newLines = content.split("\n");
        const added = Math.max(0, newLines.length - prevLines.length);
        setDiffAddedCount(added);
      }
      prevContentRef.current = content;
      setLocalText(content);
    }
  }, [content, localText]);

  // Parse docx if binary base64 or fetch from backend
  useEffect(() => {
    const isDocx = (/\.(docx|doc|odt|rtf)$/i).test(title);
    if (!isDocx) {
      setParsedDoc(null);
      return;
    }

    // Try parsing docx via backend endpoint
    if (filePath) {
      fetch("http://127.0.0.1:4096/api/desktop/parse-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            const paras = (json.data.paragraphs || []).map((p: any) => p.text || "");
            const tbls = (json.data.tables || []).map((tb: any) => tb.rows || []);
            setParsedDoc({ paragraphs: paras, tables: tbls });
          }
        })
        .catch(() => {
          // Fallback to local text
        });
    }
  }, [filePath, title]);

  // Clean Markdown content without raw HTML/emojis
  const cleanMarkdown = useMemo(() => {
    let clean = localText;
    // Strip canvas markers if present
    clean = clean.replace(/\[CANVAS\][\s\S]*?\[\/CANVAS\]/gi, (match) => {
      return match.replace(/\[\/?CANVAS\]/gi, "").trim();
    });
    return clean.trim();
  }, [localText]);

  // Split content into simulated A4 pages (~2800 characters or ~42 lines per page)
  const pages = useMemo(() => {
    if (viewMode === "flow") {
      return [cleanMarkdown];
    }

    const lines = cleanMarkdown.split("\n");
    const pageSize = 42; // lines per A4 page
    const pageList: string[] = [];

    for (let i = 0; i < lines.length; i += pageSize) {
      pageList.push(lines.slice(i, i + pageSize).join("\n"));
    }

    return pageList.length > 0 ? pageList : [cleanMarkdown];
  }, [cleanMarkdown, viewMode]);

  const totalPages = pages.length;

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 10, 150));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 10, 60));
  const handleZoomReset = () => setZoomLevel(100);

  // Copy document markdown
  const handleCopy = () => {
    navigator.clipboard.writeText(cleanMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Open native Microsoft Word companion
  const handleOpenNativeWord = useCallback(async () => {
    if (!filePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openWordNative) {
      await desktop.openWordNative(filePath);
    } else if (desktop?.openPath) {
      await desktop.openPath(filePath);
    }
  }, [filePath]);

  // Direct print / save as PDF
  const handlePrintPdf = useCallback(() => {
    window.print();
  }, []);

  // Save changes
  const handleSaveDoc = useCallback(async () => {
    if (onSave) {
      await onSave();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  }, [onSave]);

  const currentDateStr = useMemo(() => {
    return new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, []);

  return (
    <div
      className={cn(
        "h-full w-full flex flex-col select-none overflow-hidden font-sans outline-none transition-colors",
        isLight ? "bg-[#e5e7eb] text-slate-800" : "bg-[#111113] text-[#d4d4d8]"
      )}
    >
      {/* 1. TOP OFFICIAL WORDCRAFT TOOLBAR */}
      <div
        className={cn(
          "shrink-0 flex items-center justify-between px-3 py-1.5 border-b gap-3 text-xs z-10 transition-colors",
          isLight ? "bg-[#f8fafc] border-slate-300" : "bg-[#18181b] border-[#27272a]"
        )}
      >
        {/* Left: Brand & Document Meta */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-0.5 rounded font-semibold text-[11px] border transition-colors",
              isLight ? "bg-white border-slate-300 text-slate-900 shadow-2xs" : "bg-[#27272a] border-[#3f3f46]/60 text-white"
            )}
          >
            <FileText className={cn("w-3.5 h-3.5", isLight ? "text-slate-800" : "text-white")} />
            <span>WordCraft</span>
          </div>

          <span className={cn("text-[11px] font-mono hidden sm:inline truncate max-w-xs", isLight ? "text-slate-500" : "text-[#71717a]")}>
            {title}
          </span>

          {/* Page Badge */}
          <div
            className={cn(
              "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors",
              isLight ? "bg-white border-slate-200 text-slate-700 shadow-2xs" : "bg-[#222225] border-[#333336] text-zinc-300"
            )}
          >
            <BookOpen className="w-3 h-3 text-zinc-400" />
            <span>{totalPages} Pages</span>
          </div>

          {/* AI Live Revision Marker */}
          {diffAddedCount > 0 && (
            <div
              className={cn(
                "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border animate-pulse transition-colors",
                isLight ? "bg-white border-slate-400 text-slate-900 shadow-2xs" : "bg-[#27272a] border-zinc-500 text-white"
              )}
            >
              <Sparkles className="w-3 h-3 text-[#cf6613]" />
              <span>AI Updated (+{diffAddedCount} lines)</span>
            </div>
          )}
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-1.5">
          {/* Toggle Edit vs A4 Preview */}
          <button
            onClick={() => setIsEditorMode((prev) => !prev)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border cursor-pointer transition-colors",
              isEditorMode
                ? "bg-[#cf6613] text-white border-[#cf6613]"
                : isLight
                ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                : "bg-[#222225] hover:bg-[#2a2a2e] text-[#a1a1aa] hover:text-white border-[#333336]"
            )}
            title="Toggle Document Edit Mode"
          >
            {isEditorMode ? <Eye className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
            <span>{isEditorMode ? "View A4" : "Edit Text"}</span>
          </button>

          {/* View Mode Toggle: Paged vs Flow */}
          <button
            onClick={() => setViewMode((prev) => (prev === "paged" ? "flow" : "paged"))}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
              isLight
                ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                : "bg-[#222225] hover:bg-[#2a2a2e] text-[#a1a1aa] hover:text-white border-[#333336]"
            )}
            title="Toggle A4 Paged View or Continuous Flow"
          >
            <span>{viewMode === "paged" ? "A4 Paged" : "Continuous"}</span>
          </button>

          {/* Font Serif / Sans Toggle */}
          <button
            onClick={() => setFontFamily((prev) => (prev === "serif" ? "sans" : "serif"))}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
              isLight
                ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                : "bg-[#222225] hover:bg-[#2a2a2e] text-[#a1a1aa] hover:text-white border-[#333336]"
            )}
            title="Toggle Serif (Official) or Sans (Modern) typography"
          >
            <Type className="w-3 h-3" />
            <span className="hidden md:inline">{fontFamily === "serif" ? "Serif" : "Sans"}</span>
          </button>

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center gap-0.5 border rounded px-1 py-0.5 border-[#333336] bg-[#222225]">
            <button
              onClick={handleZoomOut}
              className="p-1 hover:text-white text-[#a1a1aa] cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={handleZoomReset}
              className="text-[10px] font-mono px-1 hover:text-white text-[#d4d4d8] cursor-pointer"
              title="Reset Zoom"
            >
              {zoomLevel}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 hover:text-white text-[#a1a1aa] cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* Save Button */}
          {onSave && (
            <button
              onClick={handleSaveDoc}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
                isLight
                  ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                  : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
              )}
              title="Save document (Ctrl+S)"
            >
              {saveSuccess ? <Check className="w-3 h-3 text-white" /> : <Save className="w-3 h-3" />}
              <span className="hidden xl:inline">{saveSuccess ? "Saved" : "Save"}</span>
            </button>
          )}

          {/* Copy Markdown */}
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
              isLight
                ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
            )}
            title="Copy document text"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span className="hidden xl:inline">{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Print / Export to PDF */}
          <button
            onClick={handlePrintPdf}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border cursor-pointer transition-colors",
              isLight
                ? "bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-2xs"
                : "bg-[#27272a] hover:bg-[#323236] text-[#e4e4e7] hover:text-white border-[#3f3f46]/60"
            )}
            title="Print or export as official A4 PDF"
          >
            <Printer className="w-3 h-3" />
            <span className="hidden md:inline">Print / PDF</span>
          </button>

          {/* Dual-Mode Companion: Open in Native Word */}
          <button
            onClick={handleOpenNativeWord}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-all shadow-xs active:scale-95 cursor-pointer shrink-0",
              isLight ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-white hover:bg-zinc-200 text-black"
            )}
            title="Open document in native desktop Microsoft Word"
          >
            <ExternalLink className={cn("w-3.5 h-3.5", isLight ? "text-white" : "text-black")} />
            <span>Native Word</span>
          </button>
        </div>
      </div>

      {/* 2. OFFICIAL PAGED A4 WORKSPACE CANVAS */}
      <div
        className={cn(
          "flex-1 overflow-auto p-4 md:p-8 flex flex-col items-center gap-8 scrollbar-thin transition-colors",
          isLight ? "bg-[#e2e8f0] scrollbar-thumb-slate-300" : "bg-[#0d0d0f] scrollbar-thumb-[#27272a]"
        )}
      >
        {isEditorMode ? (
          <div
            style={{
              width: "794px",
              minHeight: "1123px",
            }}
            className="bg-white text-slate-900 shadow-xl border border-slate-300 rounded-xs p-8 flex flex-col"
          >
            <div className="text-xs text-slate-400 font-mono mb-2 uppercase select-none">
              WordCraft Markdown Editor
            </div>
            <textarea
              value={localText}
              onChange={(e) => {
                const val = e.target.value;
                setLocalText(val);
                onContentChange?.(val);
              }}
              placeholder="Type document content in Markdown or Plain Text..."
              className="flex-1 w-full h-full min-h-[900px] outline-none font-mono text-xs leading-relaxed resize-none text-slate-900 bg-transparent"
            />
          </div>
        ) : (
          pages.map((pageText, pIdx) => {
            const pageNum = pIdx + 1;
            return (
              <div
                key={pageNum}
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: "top center",
                  width: "794px", // Standard 210mm A4 width at 96 DPI
                  minHeight: "1123px", // Standard 297mm A4 height at 96 DPI
                }}
                className={cn(
                  "bg-white text-slate-900 shadow-xl border border-slate-200/80 rounded-xs flex flex-col justify-between p-12 md:p-16 select-text transition-transform duration-100",
                  fontFamily === "serif" ? "font-serif" : "font-sans"
                )}
              >
                {/* Official Header */}
                <div className="border-b border-slate-300 pb-3 mb-8 flex items-center justify-between text-[11px] text-slate-500 font-sans uppercase tracking-wider select-none">
                  <span className="font-semibold text-slate-700">{title.replace(/\.[^/.]+$/, "")}</span>
                  <span>{currentDateStr}</span>
                </div>

                {/* Main Document Content */}
                <div className="flex-1 text-[13px] leading-relaxed text-slate-800 space-y-4">
                  {parsedDoc ? (
                    <div className="space-y-4">
                      {parsedDoc.paragraphs.map((p, idx) => (
                        <p key={idx} className="text-justify leading-relaxed">
                          {p}
                        </p>
                      ))}
                      {parsedDoc.tables.map((table, tIdx) => (
                        <table key={tIdx} className="w-full border-collapse border border-slate-300 my-4 text-xs font-sans">
                          <tbody>
                            {table.map((row, rIdx) => (
                              <tr key={rIdx} className={rIdx === 0 ? "bg-slate-100 font-bold" : "border-b border-slate-200"}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="border border-slate-300 px-3 py-1.5">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ))}
                    </div>
                  ) : (
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-xl md:text-2xl font-bold text-slate-950 border-b border-slate-900/40 pb-2 mb-4 tracking-tight">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-base md:text-lg font-bold text-slate-900 mt-6 mb-3 tracking-normal">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-sm font-semibold text-slate-900 mt-4 mb-2">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => (
                          <p className="text-[13px] leading-relaxed text-justify mb-3 text-slate-800">
                            {children}
                          </p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-5 my-3 space-y-1 text-[13px]">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-5 my-3 space-y-1 text-[13px]">
                            {children}
                          </ol>
                        ),
                        table: ({ children }) => (
                          <div className="my-4 overflow-x-auto">
                            <table className="w-full border-collapse border border-slate-300 text-xs font-sans">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-slate-100 font-semibold text-slate-900 border-b border-slate-300">
                            {children}
                          </thead>
                        ),
                        th: ({ children }) => (
                          <th className="border border-slate-300 px-3 py-2 text-left">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-slate-300 px-3 py-1.5 text-left">
                            {children}
                          </td>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-3 border-slate-400 pl-4 italic text-slate-600 my-3">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {pageText}
                    </ReactMarkdown>
                  )}
                </div>

                {/* Official Footer with Page Number */}
                <div className="border-t border-slate-300 pt-3 mt-8 flex items-center justify-between text-[11px] text-slate-400 font-sans select-none">
                  <span>Arunaki Autonomous Document OS</span>
                  <span className="font-semibold text-slate-600">
                    Halaman {pageNum} dari {totalPages}
                  </span>
                  <span>Dokumen Resmi</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
