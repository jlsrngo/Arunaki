import { useState, useCallback, useEffect, useRef, memo } from "react";
import { RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "../../../lib/utils";
import { apiFetch } from "../../../lib/api";

export interface DeckCraftProps {
  content: string;
  filePath?: string;
  title: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * DeckCraft — Official ArtCraft Pure-Rust Presentation Suite (WASM Embedded Engine)
 *
 * Runs the authentic open-source DeckCraft application (storytold/deckcraft)
 * with complete GPU-accelerated 16:9 presentation canvas, slide sorter, themes,
 * and vector shapes directly inside the Workstation Center Panel — pure ArtCraft with 0 custom UI additions.
 */
export const DeckCraft = memo(function DeckCraft({
  content,
  filePath,
  title,
  onContentChange,
  onSave,
  onDirtyChange,
}: DeckCraftProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onSaveRef.current = onSave;
    onDirtyChangeRef.current = onDirtyChange;
  }, [onContentChange, onSave, onDirtyChange]);

  const lastSentContentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      setIsLoading(false);
      setLoadError(
        "DeckCraft engine did not start within 30 seconds (bundled WebAssembly blocked or crashed)."
      );
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Send slide deck payload to DeckCraft Web via host postMessage bridge
  const sendDocumentToDeckCraft = useCallback(
    async (textPayload: string, docName: string) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      try {
        let buffer: ArrayBuffer | null = null;

        // If file exists on disk and is a PPTX, read binary bytes
        if (filePath && (/\.(pptx|ppt|odp)$/i).test(filePath)) {
          try {
            const res = await apiFetch("/api/desktop/read-binary", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filePath }),
            });
            const json = await res.json();
            if (json?.content) {
              const binaryStr = atob(json.content);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              buffer = bytes.buffer;
            }
          } catch (err) {
            console.warn("[DeckCraft] Binary read fallback:", err);
          }
        }

        if (!buffer && textPayload) {
          const encoder = new TextEncoder();
          const bytes = encoder.encode(textPayload);
          buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        }

        if (buffer) {
          iframe.contentWindow.postMessage(
            {
              type: "deckcraft:open",
              name: docName || "Presentation.pptx",
              bytes: buffer,
            },
            "*"
          );
          lastSentContentRef.current = textPayload;
        }
      } catch (err) {
        console.warn("[DeckCraft] Failed to send document buffer:", err);
      }
    },
    [filePath]
  );

  // Listen for official DeckCraft host bridge events
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "deckcraft:ready") {
        setIsReady(true);
        setIsLoading(false);
        setLoadError(null);

        if (content || filePath) {
          sendDocumentToDeckCraft(content, title);
        }
      } else if (data.type === "deckcraft:save") {
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
          if (onDirtyChangeRef.current) {
            onDirtyChangeRef.current(false);
          }
        } catch (err) {
          console.warn("[DeckCraft] Failed to process saved document bytes:", err);
        }
      } else if (data.type === "deckcraft:dirty") {
        if (onDirtyChangeRef.current) {
          onDirtyChangeRef.current(Boolean(data.dirty));
        }
      } else if (data.type === "deckcraft:failed") {
        setIsLoading(false);
        setLoadError(data.error || "Failed to initialize DeckCraft WebAssembly runtime.");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [content, title, filePath, sendDocumentToDeckCraft]);

  useEffect(() => {
    if (isReady && content && content !== lastSentContentRef.current) {
      sendDocumentToDeckCraft(content, title);
    }
  }, [content, isReady, title, sendDocumentToDeckCraft]);

  // Open native PowerPoint companion (Dual-Mode Architecture)
  const handleOpenNativePpt = useCallback(async () => {
    if (!filePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openPath) {
      await desktop.openPath(filePath);
    }
  }, [filePath]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#262626] overflow-hidden select-none">
      {/* 1. Loading State */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f3f2f1] dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#cf6613]" />
            <span className="text-sm font-medium tracking-tight">
              Loading ArtCraft DeckCraft Suite...
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-mono">
            Initializing Pure-Rust WebAssembly engine & 16:9 presentation canvas
          </p>
        </div>
      )}

      {/* 2. Error Fallback State */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f3f2f1] dark:bg-[#18181b] p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
          <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
            Unable to Launch DeckCraft Canvas
          </h3>
          <p className="text-xs text-neutral-500 max-w-md mb-4">{loadError}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsLoading(true);
                setLoadError(null);
                if (iframeRef.current) {
                  iframeRef.current.src = "/artcraft/deckcraft/index.html?host=parent&t=" + Date.now();
                }
              }}
              className="px-3.5 py-1.5 rounded-md bg-[#cf6613] text-white text-xs font-medium hover:bg-[#b5550f] transition-colors cursor-pointer"
            >
              Retry
            </button>
            {filePath && (
              <button
                onClick={handleOpenNativePpt}
                className="px-3.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Native PowerPoint
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Official DeckCraft Pure-Rust WebAssembly Canvas */}
      <iframe
        ref={iframeRef}
        src="/artcraft/deckcraft/index.html?host=parent"
        title="ArtCraft DeckCraft Suite"
        onLoad={() => {
          setIsLoading(false);
        }}
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
