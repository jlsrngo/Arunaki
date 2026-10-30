import { useState, useMemo, useCallback } from "react";
import Markdown from "react-markdown";
import {
  Copy,
  Check,
  Download,
  Search,
  Code2,
  Eye,
  FileSpreadsheet,
  FileText,
  Save,
  Table as TableIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";

export interface CanvasViewProps {
  content: string;
  title: string;
  tabId?: string;
  timeStr?: string;
  createdAt?: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
  rawMarkdown: string;
}

interface ContentSection {
  type: "text" | "table";
  text?: string;
  table?: ParsedTable;
}

/**
 * Native Canvas Workspace UI — Arunaki Autonomous Document OS
 *
 * Dedicated, beautiful, high-speed Canvas view for AI-generated artifacts,
 * data tables, recaps, and notes. Zero iframe overhead, instant reactivity,
 * and high-end typography with search, filter, and export capabilities.
 */
export function CanvasView({
  content,
  title,
  timeStr,
  onContentChange,
  onSave,
}: CanvasViewProps) {
  const [viewMode, setViewMode] = useState<"visual" | "edit">("visual");
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localEditContent, setLocalEditContent] = useState(content);

  // Sync content if changed externally when in visual mode
  const currentContent = viewMode === "edit" ? localEditContent : content;

  // Parse markdown tables and text blocks
  const sections = useMemo<ContentSection[]>(() => {
    if (!currentContent) return [];
    const lines = currentContent.split(/\r?\n/);
    const result: ContentSection[] = [];
    let currentTextLines: string[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.startsWith("|") && line.endsWith("|") && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const isSeparator =
          nextLine.startsWith("|") &&
          nextLine.endsWith("|") &&
          /^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(nextLine);

        if (isSeparator) {
          if (currentTextLines.length > 0) {
            const t = currentTextLines.join("\n").trim();
            if (t) result.push({ type: "text", text: t });
            currentTextLines = [];
          }

          const rawTableLines: string[] = [lines[i], lines[i + 1]];
          const headers = line
            .slice(1, -1)
            .split("|")
            .map((h) => h.trim());

          i += 2;
          const rows: string[][] = [];
          while (
            i < lines.length &&
            lines[i].trim().startsWith("|") &&
            lines[i].trim().endsWith("|")
          ) {
            rawTableLines.push(lines[i]);
            const cells = lines[i]
              .trim()
              .slice(1, -1)
              .split("|")
              .map((c) => c.trim());
            rows.push(cells);
            i++;
          }

          result.push({
            type: "table",
            table: {
              headers,
              rows,
              rawMarkdown: rawTableLines.join("\n"),
            },
          });
          continue;
        }
      }
      currentTextLines.push(lines[i]);
      i++;
    }

    if (currentTextLines.length > 0) {
      const t = currentTextLines.join("\n").trim();
      if (t) result.push({ type: "text", text: t });
    }

    return result.length > 0 ? result : [{ type: "text", text: currentContent }];
  }, [currentContent]);

  // Statistics
  const stats = useMemo(() => {
    let totalRows = 0;
    let totalCols = 0;
    let hasTable = false;
    for (const sec of sections) {
      if (sec.type === "table" && sec.table) {
        hasTable = true;
        totalRows += sec.table.rows.length;
        totalCols = Math.max(totalCols, sec.table.headers.length);
      }
    }
    const words = currentContent.trim().split(/\s+/).filter(Boolean).length;
    return { hasTable, totalRows, totalCols, words };
  }, [sections, currentContent]);

  // Copy full canvas content
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      setCopied(true);
      toast.success("Canvas content copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy content");
    }
  }, [currentContent]);

  // Export as Markdown
  const handleExportMarkdown = useCallback(() => {
    const blob = new Blob([currentContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "canvas"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Exported Canvas as Markdown");
  }, [currentContent, title]);

  // Export primary table as CSV
  const handleExportCsv = useCallback(() => {
    const tableSec = sections.find((s) => s.type === "table" && s.table);
    if (!tableSec || !tableSec.table) {
      toast.info("No table found to export as CSV");
      return;
    }
    const { headers, rows } = tableSec.table;
    const csvLines = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")),
    ];
    const blob = new Blob([csvLines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "data-table"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Exported table as CSV");
  }, [sections, title]);

  // Handle manual save
  const handleManualSave = useCallback(async () => {
    if (onContentChange) {
      onContentChange(localEditContent);
    }
    if (onSave) {
      setIsSaving(true);
      try {
        await onSave();
        toast.success("Canvas saved successfully");
      } catch {
        toast.error("Failed to save canvas");
      } finally {
        setIsSaving(false);
      }
    } else {
      toast.success("Canvas updated");
    }
  }, [localEditContent, onContentChange, onSave]);

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-card)] select-text text-[var(--text-primary)] overflow-hidden font-sans">
      {/* 1. TOP TOOLBAR */}
      <div className="h-10 px-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-between shrink-0 gap-3 select-none">
        {/* Left: Icon, Title, and Stats Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-5 h-5 rounded-none bg-[var(--bg-panel-sub)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
            {stats.hasTable ? (
              <TableIcon className="w-3 h-3 text-[var(--text-secondary)]" />
            ) : (
              <FileText className="w-3 h-3 text-[var(--text-secondary)]" />
            )}
          </div>
          <span className="text-xs font-semibold tracking-tight text-[var(--text-primary)] truncate max-w-[240px]">
            {title}
          </span>
          <span className="px-2 py-0.5 rounded-none text-[10px] font-mono font-medium bg-[var(--bg-panel-sub)] text-[var(--text-muted)] border border-[var(--border-color)] shrink-0">
            {stats.hasTable
              ? `${stats.totalRows} rows · ${stats.totalCols} cols`
              : `${stats.words} words`}
          </span>
          {timeStr && (
            <span className="text-[10px] font-mono text-[var(--text-dim)] hidden sm:inline shrink-0">
              {timeStr}
            </span>
          )}
        </div>

        {/* Right: Search, Mode Switcher & Proportional Action Icons */}
        <div className="flex items-center gap-2 shrink-0">
          {viewMode === "visual" && stats.hasTable && (
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-[var(--text-muted)] absolute left-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter rows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-32 sm:w-44 h-7 pl-6 pr-2 rounded-none bg-[var(--bg-panel-sub)] border border-[var(--border-color)] text-[11px] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
              />
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center bg-[var(--bg-panel-sub)] border border-[var(--border-color)] rounded-none p-0.5">
            <button
              onClick={() => {
                if (viewMode === "edit" && onContentChange) {
                  onContentChange(localEditContent);
                }
                setViewMode("visual");
              }}
              title="Visual Canvas View"
              className={cn(
                "px-2 py-0.5 rounded-none text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer",
                viewMode === "visual"
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <Eye className="w-3 h-3" />
              <span className="hidden md:inline">Canvas</span>
            </button>
            <button
              onClick={() => {
                setLocalEditContent(content);
                setViewMode("edit");
              }}
              title="Markdown / Raw Editor"
              className={cn(
                "px-2 py-0.5 rounded-none text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer",
                viewMode === "edit"
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <Code2 className="w-3 h-3" />
              <span className="hidden md:inline">Edit</span>
            </button>
          </div>

          {/* Action Icons (Minimalist, Proportional, Matching CenterTabHeader) */}
          {viewMode === "edit" ? (
            <button
              onClick={handleManualSave}
              disabled={isSaving}
              className="h-7 px-2.5 rounded-none border border-[var(--border-color)] bg-[var(--bg-panel-sub)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              <span>Save</span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {stats.hasTable && (
                <button
                  onClick={handleExportCsv}
                  title="Export Table as CSV"
                  className="p-1.5 rounded-none text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              )}

              <button
                onClick={handleExportMarkdown}
                title="Download as Markdown"
                className="p-1.5 rounded-none text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>

              <button
                onClick={handleCopy}
                title="Copy Canvas Content"
                className="p-1.5 rounded-none text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" strokeWidth={1.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. BODY CONTENT */}
      {viewMode === "visual" ? (
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
          {sections.map((section, idx) => {
            if (section.type === "table" && section.table) {
              const { headers, rows, rawMarkdown } = section.table;
              const q = searchQuery.toLowerCase().trim();
              const filteredRows = q
                ? rows.filter((r) => r.some((c) => c.toLowerCase().includes(q)))
                : rows;

              return (
                <div
                  key={`table-${idx}`}
                  className="rounded-none border border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden flex flex-col"
                >
                  {/* Table Header Bar */}
                  <div className="px-3.5 py-2 bg-[var(--bg-panel-sub)] border-b border-[var(--border-color)] flex items-center justify-between gap-3 text-xs select-none">
                    <div className="flex items-center gap-2">
                      <TableIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      <span className="font-semibold text-[var(--text-primary)]">
                        Structured Data Table
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-dim)]">
                        {q
                          ? `Showing ${filteredRows.length} of ${rows.length} rows`
                          : `${rows.length} records`}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(rawMarkdown);
                        toast.success("Table copied as Markdown");
                      }}
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Table</span>
                    </button>
                  </div>

                  {/* Scrollable Data Grid */}
                  <div className="overflow-x-auto max-h-[560px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-color)] bg-[var(--bg-panel-sub)] sticky top-0 z-10">
                          <th className="py-2 px-3 text-[10px] font-mono font-medium text-[var(--text-muted)] border-r border-[var(--border-color)] w-10 text-center select-none">
                            #
                          </th>
                          {headers.map((h, hIdx) => (
                            <th
                              key={hIdx}
                              className="py-2 px-3 text-[11px] font-semibold text-[var(--text-primary)] border-r border-[var(--border-color)] last:border-r-0 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length > 0 ? (
                          filteredRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)]/50 transition-colors last:border-b-0"
                            >
                              <td className="py-2 px-2.5 text-[10px] font-mono text-[var(--text-dim)] border-r border-[var(--border-color)] text-center select-none">
                                {rIdx + 1}
                              </td>
                              {row.map((cell, cIdx) => {
                                const isNumber = /^[\d.,$€£%+\-–\s]+$/.test(cell.trim()) && cell.trim().length > 0;
                                return (
                                  <td
                                    key={cIdx}
                                    className={cn(
                                      "py-2 px-3 text-[11px] text-[var(--text-secondary)] border-r border-[var(--border-color)] last:border-r-0 break-words",
                                      isNumber && "text-right font-mono text-[var(--text-primary)]"
                                    )}
                                  >
                                    {cell}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={headers.length + 1}
                              className="py-8 text-center text-xs text-[var(--text-dim)] font-mono"
                            >
                              No matching rows found for "{searchQuery}"
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`text-${idx}`}
                className="prose max-w-none text-sm text-[var(--text-secondary)] leading-relaxed font-sans"
              >
                <Markdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight mt-4 mb-2 pb-1 border-b border-[var(--border)]">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight mt-4 mb-2">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-3 mb-1">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
                    ul: ({ children }) => (
                      <ul className="list-disc ml-5 mb-3 space-y-1 text-[var(--text-secondary)]">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal ml-5 mb-3 space-y-1 text-[var(--text-secondary)]">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    code: ({ children }) => (
                      <code className="px-1.5 py-0.5 rounded bg-[var(--bg-panel-sub)] border border-[var(--border)] text-xs font-mono text-[var(--text-primary)]">
                        {children}
                      </code>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="pl-3 border-l-2 border-[var(--border-strong)] my-3 text-[var(--text-muted)] italic">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {section.text || ""}
                </Markdown>
              </div>
            );
          })}
        </div>
      ) : (
        /* 3. EDIT MODE */
        <div className="flex-1 flex flex-col p-4 bg-[var(--bg-card)]">
          <textarea
            value={localEditContent}
            onChange={(e) => {
              setLocalEditContent(e.target.value);
              if (onContentChange) {
                onContentChange(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                handleManualSave();
              }
            }}
            placeholder="Type or edit markdown / table content here (Ctrl+S to save)..."
            className="w-full flex-1 p-4 rounded-lg bg-[var(--bg-panel)] border border-[var(--border)] font-mono text-xs text-neutral-200 leading-relaxed resize-none focus:outline-hidden focus:border-white transition-colors"
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500 font-mono select-none">
            <span>Press Ctrl+S to save modifications</span>
            <span>{localEditContent.length} characters</span>
          </div>
        </div>
      )}
    </div>
  );
}
