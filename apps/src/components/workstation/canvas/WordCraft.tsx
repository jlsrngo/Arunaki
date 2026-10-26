import { useState, useCallback, useEffect, useRef, memo } from "react";
import { ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface WordCraftProps {
  content: string;
  filePath?: string;
  title: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
}

/**
 * WordCraft — Official ArtCraft Pure-Rust Document Suite (WASM Embedded Engine)
 *
 * Runs the authentic open-source WordCraft application (storytold/wordcraft)
 * with complete Office Ribbon, Interactive Margin Ruler, Document Navigation Outline,
 * and GPU-accelerated A4 Page Canvas directly inside the Workstation Center Panel.
 */
export const WordCraft = memo(function WordCraft({
  content,
  filePath,
  title,
  onContentChange,
  onSave,
}: WordCraftProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [forceWebGL, setForceWebGL] = useState(false);

  // Keep latest callbacks in ref to avoid re-subscribing message listener
  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onSaveRef.current = onSave;
  }, [onContentChange, onSave]);

  const lastSentContentRef = useRef<string | null>(null);

  // Never leave the user staring at a spinner: if the WASM app does not boot, show the error state.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      setIsLoading(false);
      setLoadError(
        "WordCraft engine did not start within 30 seconds (bundled WebAssembly blocked or crashed)."
      );
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Send document payload to WordCraft Web via the official host postMessage bridge
  const sendDocumentToWordCraft = useCallback(
    (textPayload: string, docName: string) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(textPayload);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

        iframe.contentWindow.postMessage(
          {
            type: "wordcraft:open",
            name: docName || "Document.docx",
            bytes: buffer,
          },
          "*"
        );
        lastSentContentRef.current = textPayload;
      } catch (err) {
        console.warn("[WordCraft] Failed to send document buffer:", err);
      }
    },
    []
  );

  // Listen for official WordCraft host bridge events (?host=parent)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      // 1. App is up and ready for files
      if (data.type === "wordcraft:ready") {
        setIsReady(true);
        setIsLoading(false);
        setLoadError(null);

        // Immediately send current document content
        if (content) {
          sendDocumentToWordCraft(content, title);
        }
      }

      // 2. User clicked Save (Ctrl+S or File > Save)
      else if (data.type === "wordcraft:save") {
        try {
          if (data.bytes) {
            const rawBytes = new Uint8Array(data.bytes);
            const decoder = new TextDecoder("utf-8", { fatal: false });
            const decodedText = decoder.decode(rawBytes);

            if (onContentChangeRef.current) {
              onContentChangeRef.current(decodedText);
            }
            if (onSaveRef.current) {
              onSaveRef.current();
            }
          }
          setIsDirty(false);
        } catch (err) {
          console.warn("[WordCraft] Failed to process saved document bytes:", err);
        }
      }

      // 3. Document dirty status changes
      else if (data.type === "wordcraft:dirty") {
        setIsDirty(Boolean(data.dirty));
      }

      // 4. Failed to start (e.g. GPU WebGL context lost)
      else if (data.type === "wordcraft:failed") {
        setIsLoading(false);
        setLoadError(data.error || "Failed to initialize WordCraft WebGPU/WebGL runtime.");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [content, title, sendDocumentToWordCraft]);

  // Sync external content updates from AI to WordCraft if modified externally
  useEffect(() => {
    if (isReady && content && content !== lastSentContentRef.current) {
      sendDocumentToWordCraft(content, title);
    }
  }, [content, isReady, title, sendDocumentToWordCraft]);

  // Open native Microsoft Word companion (Dual-Mode Architecture)
  const handleOpenNativeWord = useCallback(async () => {
    if (!filePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openWordNative) {
      await desktop.openWordNative(filePath);
    } else if (desktop?.openPath) {
      await desktop.openPath(filePath);
    }
  }, [filePath]);

  const iframeSrc = forceWebGL
    ? "/artcraft/wordcraft/index.html?host=parent&webgl"
    : "/artcraft/wordcraft/index.html?host=parent";

  return (
    <div className="relative w-full h-full flex flex-col bg-[#e6e6e6] overflow-hidden select-none">
      {/* 1. Loading State */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f3f2f1] dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#cf6613]" />
            <span className="text-sm font-medium tracking-tight">
              Loading ArtCraft WordCraft Suite...
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-mono">
            Initializing Pure-Rust WebAssembly engine & GPU canvas
          </p>
        </div>
      )}

      {/* 2. Error Fallback State */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f3f2f1] dark:bg-[#18181b] p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
          <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
            Unable to Launch WordCraft Canvas
          </h3>
          <p className="text-xs text-neutral-500 max-w-md mb-4">{loadError}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setForceWebGL(true);
                setIsLoading(true);
                setLoadError(null);
              }}
              className="px-3.5 py-1.5 rounded-md bg-[#cf6613] text-white text-xs font-medium hover:bg-[#b5550f] transition-colors cursor-pointer"
            >
              Retry with WebGL2 Fallback
            </button>
            {filePath && (
              <button
                onClick={handleOpenNativeWord}
                className="px-3.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Native Word
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Unsaved state indicator */}
      <div className="absolute top-2 right-3 z-30 flex items-center gap-2 pointer-events-auto">
        {isDirty && (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20 backdrop-blur-xs">
            Unsaved Changes
          </span>
        )}
      </div>

      {/* 4. Official WordCraft Pure-Rust WebAssembly Canvas */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="ArtCraft WordCraft Suite"
        className={cn(
          "w-full h-full border-0 block flex-1 transition-opacity duration-200",
          isLoading ? "opacity-0" : "opacity-100"
        )}
        allow="fullscreen; clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"
      />
    </div>
  );
});
