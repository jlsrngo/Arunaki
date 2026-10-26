import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  Presentation,
  Play,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Minimize2,
  Plus,
  Copy,
  Check,
  Save,
  Edit3,
  Eye,
  Sparkles,
  Printer,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTheme } from "../../../lib/theme";

export interface DeckCraftProps {
  content: string;
  filePath?: string;
  title: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
}

export interface DeckSlide {
  id: number;
  title: string;
  subtitle?: string;
  content: string;
  layout?: "title" | "metrics" | "bullets" | "table";
}

/**
 * DeckCraft — Official Pure-Rust ArtCraft Document Suite 16:9 Slide Presenter & Engine
 */
export function DeckCraft({
  content,
  filePath,
  title,
  onContentChange,
  onSave,
}: DeckCraftProps) {
  const { isLight } = useTheme();

  // Navigation & View State
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isEditorMode, setIsEditorMode] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Live AI Update Indicator
  const [diffAddedCount, setDiffAddedCount] = useState<number>(0);
  const prevContentRef = useRef<string>(content);

  // Local document state
  const [localText, setLocalText] = useState<string>(content);
  const [parsedPptxSlides, setParsedPptxSlides] = useState<DeckSlide[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync content prop
  useEffect(() => {
    if (content !== localText) {
      if (prevContentRef.current && content !== prevContentRef.current) {
        const prevLen = prevContentRef.current.split("\n").length;
        const newLen = content.split("\n").length;
        setDiffAddedCount(Math.max(0, newLen - prevLen));
      }
      prevContentRef.current = content;
      setLocalText(content);
    }
  }, [content, localText]);

  // Parse .pptx via pure-rust backend endpoint if physical file
  useEffect(() => {
    const isPpt = (/\.(pptx|ppt|odp)$/i).test(title);
    if (!isPpt) {
      setParsedPptxSlides(null);
      return;
    }

    if (filePath) {
      fetch("http://127.0.0.1:4096/api/desktop/parse-ppt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data && json.data.slides) {
            const list: DeckSlide[] = json.data.slides.map((s: any, idx: number) => {
              const texts = (s.shapes || [])
                .map((sh: any) => sh.text)
                .filter((t: any) => t && t !== "null");
              const slideTitle = texts[0] || `Slide ${idx + 1}`;
              const slideContent = texts.slice(1).join("\n\n");
              return {
                id: idx + 1,
                title: slideTitle,
                content: slideContent,
                layout: idx === 0 ? "title" : "bullets",
              };
            });
            if (list.length > 0) {
              setParsedPptxSlides(list);
            }
          }
        })
        .catch(() => {
          // Fallback to text parsing
        });
    }
  }, [filePath, title]);

  // Parse markdown into slides (split by `---` or `# `)
  const slides: DeckSlide[] = useMemo(() => {
    if (parsedPptxSlides && parsedPptxSlides.length > 0) {
      return parsedPptxSlides;
    }

    let clean = localText;
    // Strip canvas markers
    clean = clean.replace(/\[\/?CANVAS\]/gi, "").trim();

    if (!clean) {
      return [
        {
          id: 1,
          title: title.replace(/\.[^/.]+$/, "") || "Presentation Deck",
          content: "Empty presentation deck...",
          layout: "title",
        },
      ];
    }

    // Split by horizontal rule `---` or `===`
    const rawSections = clean.split(/\r?\n---+\r?\n/).map((s) => s.trim()).filter(Boolean);

    if (rawSections.length > 1) {
      return rawSections.map((section, idx) => {
        const lines = section.split("\n");
        const firstHeader = lines.find((l) => l.startsWith("#"));
        const slideTitle = firstHeader ? firstHeader.replace(/^#+\s*/, "") : `Slide ${idx + 1}`;
        const restContent = lines.filter((l) => l !== firstHeader).join("\n").trim();

        // Check if metrics slide
        const isMetrics = restContent.includes("Rp ") || restContent.includes("%") || restContent.includes("Total");

        return {
          id: idx + 1,
          title: slideTitle,
          content: restContent,
          layout: idx === 0 ? "title" : isMetrics ? "metrics" : "bullets",
        };
      });
    }

    // Fallback: split by H1 / H2 tags
    const h1Sections = clean.split(/(?=^#\s+)/m).map((s) => s.trim()).filter(Boolean);
    if (h1Sections.length > 1) {
      return h1Sections.map((sec, idx) => {
        const lines = sec.split("\n");
        const slideTitle = lines[0].replace(/^#+\s*/, "");
        const restContent = lines.slice(1).join("\n").trim();
        return {
          id: idx + 1,
          title: slideTitle,
          content: restContent,
          layout: idx === 0 ? "title" : "bullets",
        };
      });
    }

    return [
      {
        id: 1,
        title: title.replace(/\.[^/.]+$/, "") || "Executive Summary",
        content: clean,
        layout: "title",
      },
    ];
  }, [parsedPptxSlides, localText, title]);

  const totalSlides = slides.length;
  const currentSlide = slides[activeSlideIndex] || slides[0];

  // Navigation handlers
  const handlePrevSlide = useCallback(() => {
    setActiveSlideIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleNextSlide = useCallback(() => {
    setActiveSlideIndex((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditorMode) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === "F5") {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      } else if (e.key === "Escape" && isFullscreen) {
        e.preventDefault();
        setIsFullscreen(false);
      }
    },
    [isEditorMode, handleNextSlide, handlePrevSlide, isFullscreen]
  );

  // Open native Microsoft PowerPoint companion
  const handleOpenNativePpt = useCallback(async () => {
    if (!filePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openPptNative) {
      await desktop.openPptNative(filePath);
    } else if (desktop?.openPath) {
      await desktop.openPath(filePath);
    }
  }, [filePath]);

  // Add new blank slide
  const handleAddSlide = useCallback(() => {
    const newSlideText = `\n\n---\n# Slide ${totalSlides + 1}\n\n- Point utama presentasi di sini\n- Metrik kinerja atau kesimpulan`;
    const nextText = localText + newSlideText;
    setLocalText(nextText);
    onContentChange?.(nextText);
    setActiveSlideIndex(totalSlides);
  }, [totalSlides, localText, onContentChange]);

  // Save changes
  const handleSaveDeck = useCallback(async () => {
    if (onSave) {
      await onSave();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  }, [onSave]);

  const handleCopyText = () => {
    navigator.clipboard.writeText(localText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentDateStr = useMemo(() => {
    return new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, []);

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "h-full w-full flex flex-col select-none overflow-hidden font-sans outline-none transition-colors",
        isFullscreen ? "fixed inset-0 z-50 bg-[#09090b] text-white" : isLight ? "bg-[#f1f5f9] text-slate-800" : "bg-[#111113] text-[#d4d4d8]"
      )}
    >
      {/* 1. TOP OFFICIAL DECKCRAFT TOOLBAR */}
      {!isFullscreen && (
        <div
          className={cn(
            "shrink-0 flex items-center justify-between px-3 py-1.5 border-b gap-3 text-xs z-10 transition-colors",
            isLight ? "bg-[#f8fafc] border-slate-300" : "bg-[#18181b] border-[#27272a]"
          )}
        >
          {/* Left: Brand & Slide Meta */}
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-0.5 rounded font-semibold text-[11px] border transition-colors",
                isLight ? "bg-white border-slate-300 text-slate-900 shadow-2xs" : "bg-[#27272a] border-[#3f3f46]/60 text-white"
              )}
            >
              <Presentation className={cn("w-3.5 h-3.5", isLight ? "text-slate-800" : "text-white")} />
              <span>DeckCraft</span>
            </div>

            <span className={cn("text-[11px] font-mono hidden sm:inline truncate max-w-xs", isLight ? "text-slate-500" : "text-[#71717a]")}>
              {title}
            </span>

            {/* Slide Position Counter */}
            <div
              className={cn(
                "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors",
                isLight ? "bg-white border-slate-200 text-slate-700 shadow-2xs" : "bg-[#222225] border-[#333336] text-zinc-300"
              )}
            >
              <span>
                Slide {activeSlideIndex + 1} of {totalSlides}
              </span>
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
                <span>AI Slide Updated (+{diffAddedCount} lines)</span>
              </div>
            )}
          </div>

          {/* Right: Controls & Actions */}
          <div className="flex items-center gap-1.5">
            {/* Slide Navigation Buttons */}
            <div className="flex items-center border rounded px-1 py-0.5 border-[#333336] bg-[#222225]">
              <button
                onClick={handlePrevSlide}
                disabled={activeSlideIndex === 0}
                className="p-1 hover:text-white text-[#a1a1aa] disabled:opacity-30 cursor-pointer"
                title="Previous Slide (←)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono px-1.5 text-white">
                {activeSlideIndex + 1} / {totalSlides}
              </span>
              <button
                onClick={handleNextSlide}
                disabled={activeSlideIndex === totalSlides - 1}
                className="p-1 hover:text-white text-[#a1a1aa] disabled:opacity-30 cursor-pointer"
                title="Next Slide (→)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Present Fullscreen Mode */}
            <button
              onClick={() => setIsFullscreen(true)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#cf6613] hover:bg-[#b5550d] text-white shadow-2xs cursor-pointer transition-all active:scale-95"
              )}
              title="Launch Fullscreen Presentation (F5)"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Present</span>
            </button>

            {/* Toggle Edit vs View Slide */}
            <button
              onClick={() => setIsEditorMode((prev) => !prev)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border cursor-pointer transition-colors",
                isEditorMode
                  ? "bg-white text-slate-900 border-slate-400"
                  : isLight
                  ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                  : "bg-[#222225] hover:bg-[#2a2a2e] text-[#a1a1aa] hover:text-white border-[#333336]"
              )}
              title="Toggle Markdown Slide Deck Editor"
            >
              {isEditorMode ? <Eye className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
              <span>{isEditorMode ? "View Slide" : "Edit Deck"}</span>
            </button>

            {/* Add Slide */}
            <button
              onClick={handleAddSlide}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
                isLight
                  ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                  : "bg-[#222225] hover:bg-[#2a2a2e] text-[#a1a1aa] hover:text-white border-[#333336]"
              )}
              title="Add a new slide to presentation deck"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden md:inline">Slide</span>
            </button>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-0.5 border rounded px-1 py-0.5 border-[#333336] bg-[#222225]">
              <button
                onClick={() => setZoomLevel((prev) => Math.max(prev - 10, 60))}
                className="p-1 hover:text-white text-[#a1a1aa] cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="text-[10px] font-mono px-1 hover:text-white text-[#d4d4d8] cursor-pointer"
                title="Reset Zoom"
              >
                {zoomLevel}%
              </button>
              <button
                onClick={() => setZoomLevel((prev) => Math.min(prev + 10, 150))}
                className="p-1 hover:text-white text-[#a1a1aa] cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>

            {/* Save Button */}
            {onSave && (
              <button
                onClick={handleSaveDeck}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
                  isLight
                    ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                    : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
                )}
                title="Save presentation deck (Ctrl+S)"
              >
                {saveSuccess ? <Check className="w-3 h-3 text-white" /> : <Save className="w-3 h-3" />}
                <span className="hidden xl:inline">{saveSuccess ? "Saved" : "Save"}</span>
              </button>
            )}

            {/* Copy Text */}
            <button
              onClick={handleCopyText}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
                isLight
                  ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                  : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
              )}
              title="Copy presentation text"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span className="hidden xl:inline">{copied ? "Copied" : "Copy"}</span>
            </button>

            {/* Print Handouts */}
            <button
              onClick={() => window.print()}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors",
                isLight
                  ? "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs"
                  : "bg-[#27272a] hover:bg-[#323236] text-[#d4d4d8] hover:text-white border-[#3f3f46]/50"
              )}
              title="Print slide handouts"
            >
              <Printer className="w-3 h-3" />
              <span className="hidden xl:inline">Print</span>
            </button>

            {/* Dual-Mode Companion: Open in Native PowerPoint */}
            <button
              onClick={handleOpenNativePpt}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-all shadow-xs active:scale-95 cursor-pointer shrink-0",
                isLight ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-white hover:bg-zinc-200 text-black"
              )}
              title="Open document in native desktop Microsoft PowerPoint"
            >
              <ExternalLink className={cn("w-3.5 h-3.5", isLight ? "text-white" : "text-black")} />
              <span>Native PPT</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. MAIN 16:9 SLIDE VIEW WITH THUMBNAIL STRIP */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
        {/* Left Thumbnail Strip (Hidden in Fullscreen) */}
        {!isFullscreen && !isEditorMode && (
          <div
            className={cn(
              "w-48 sm:w-56 shrink-0 border-r flex flex-col p-3 gap-3 overflow-y-auto select-none scrollbar-thin transition-colors",
              isLight ? "bg-[#f8fafc] border-slate-200" : "bg-[#141416] border-[#222225]"
            )}
          >
            <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase px-1">
              Slides ({totalSlides})
            </div>
            {slides.map((s, idx) => {
              const isActive = idx === activeSlideIndex;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSlideIndex(idx)}
                  className={cn(
                    "flex flex-col gap-1 p-2 rounded cursor-pointer border transition-all text-left",
                    isActive
                      ? isLight
                        ? "bg-white border-slate-900 shadow-md ring-2 ring-slate-900/10"
                        : "bg-[#222226] border-white shadow-md ring-2 ring-white/10"
                      : isLight
                      ? "bg-white/60 hover:bg-white border-slate-200 text-slate-600"
                      : "bg-[#18181b] hover:bg-[#1e1e22] border-[#27272a] text-[#a1a1aa]"
                  )}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>#{idx + 1}</span>
                    <span className="capitalize">{s.layout || "slide"}</span>
                  </div>
                  {/* Miniature 16:9 card preview */}
                  <div className="aspect-video w-full rounded bg-slate-950 p-1.5 flex flex-col justify-between overflow-hidden text-[8px] text-zinc-300">
                    <span className="font-bold truncate text-white">{s.title}</span>
                    <span className="line-clamp-2 text-zinc-400">{s.content || "Empty slide"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Center: Active 16:9 Slide Canvas */}
        <div
          ref={containerRef}
          className={cn(
            "flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-auto relative transition-colors",
            isFullscreen ? "bg-[#09090b]" : isLight ? "bg-[#e2e8f0]" : "bg-[#0d0d0f]"
          )}
        >
          {/* Fullscreen Floating Controls */}
          {isFullscreen && (
            <div className="absolute top-4 right-4 flex items-center gap-2 z-20 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white">
              <span className="text-xs font-mono font-bold">
                {activeSlideIndex + 1} / {totalSlides}
              </span>
              <button
                onClick={handlePrevSlide}
                disabled={activeSlideIndex === 0}
                className="p-1 hover:text-white text-zinc-400 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextSlide}
                disabled={activeSlideIndex === totalSlides - 1}
                className="p-1 hover:text-white text-zinc-400 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-1 hover:text-white text-zinc-400 cursor-pointer ml-1"
                title="Exit Fullscreen (Esc)"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {isEditorMode ? (
            <div
              style={{
                width: "960px",
                height: "540px",
              }}
              className="bg-white text-slate-900 shadow-2xl border border-slate-300 rounded-sm p-8 flex flex-col"
            >
              <div className="text-xs text-slate-400 font-mono mb-2 uppercase select-none">
                DeckCraft Slide Deck Editor (Separate slides using `---`)
              </div>
              <textarea
                value={localText}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalText(val);
                  onContentChange?.(val);
                }}
                placeholder="Type slides in Markdown. Separate each slide with ---..."
                className="flex-1 w-full h-full outline-none font-mono text-xs leading-relaxed resize-none text-slate-900 bg-transparent"
              />
            </div>
          ) : (
            /* 16:9 Presentation Card */
            <div
              style={{
                transform: `scale(${isFullscreen ? 1.25 : zoomLevel / 100})`,
                transformOrigin: "center center",
                width: "960px", // Standard 16:9 Slide Width
                height: "540px", // Standard 16:9 Slide Height
              }}
              className={cn(
                "bg-white text-slate-900 shadow-2xl border border-slate-200/80 rounded-sm flex flex-col justify-between p-12 select-text relative transition-transform duration-150 overflow-hidden",
                isFullscreen && "shadow-none border-none ring-1 ring-white/10"
              )}
            >
              {/* Slide Header Banner */}
              <div className="border-b border-slate-200 pb-3 flex items-center justify-between text-xs text-slate-400 font-sans uppercase tracking-wider select-none">
                <span className="font-semibold text-slate-600 truncate max-w-md">{title.replace(/\.[^/.]+$/, "")}</span>
                <span>{currentDateStr}</span>
              </div>

              {/* Slide Content Layout */}
              <div className="flex-1 flex flex-col justify-center my-6">
                {currentSlide.layout === "title" ? (
                  <div className="text-center space-y-4 my-auto">
                    <h1 className="text-4xl md:text-5xl font-black text-slate-950 tracking-tight leading-tight">
                      {currentSlide.title}
                    </h1>
                    <div className="text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
                      <ReactMarkdown>{currentSlide.content}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight border-b border-slate-200 pb-2">
                      {currentSlide.title}
                    </h2>
                    <div className="text-sm text-slate-700 leading-relaxed space-y-2">
                      <ReactMarkdown
                        components={{
                          ul: ({ children }) => <ul className="list-disc pl-6 space-y-2 text-sm">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-6 space-y-2 text-sm">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
                          table: ({ children }) => (
                            <table className="w-full border-collapse border border-slate-300 text-xs my-2">
                              {children}
                            </table>
                          ),
                          th: ({ children }) => (
                            <th className="border border-slate-300 bg-slate-100 px-3 py-1.5 text-left font-bold">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => <td className="border border-slate-300 px-3 py-1.5">{children}</td>,
                        }}
                      >
                        {currentSlide.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Slide Footer */}
              <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[11px] text-slate-400 font-sans select-none">
                <span className="font-medium text-slate-500">Arunaki DeckCraft Presenter</span>
                <span className="font-bold text-slate-700">
                  {activeSlideIndex + 1} / {totalSlides}
                </span>
                <span>Executive Presentation</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
