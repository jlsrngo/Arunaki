import { useState, useCallback, useEffect, useRef, memo } from "react";
import { RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "../../../lib/utils";
import { apiFetch } from "../../../lib/api";

import * as XLSX from "xlsx";

export interface GridCraftProps {
  content: string;
  filePath?: string;
  title: string;
  onContentChange?: (newContent: string) => void;
  onSave?: () => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * GridCraft — Official ArtCraft Pure-Rust Spreadsheet Suite (WASM Embedded Engine)
 *
 * Runs the authentic open-source GridCraft application (storytold/gridcraft)
 * with complete Excel-style Ribbon, Formula Bar, Multi-sheet Tabs, and GPU-accelerated
 * Cell Grid Canvas directly inside the Workstation Center Panel — pure ArtCraft with 0 custom UI additions.
 */
export const GridCraft = memo(function GridCraft({
  content,
  filePath,
  title,
  onContentChange,
  onSave,
  onDirtyChange,
}: GridCraftProps) {
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
        "GridCraft engine did not start within 30 seconds (bundled WebAssembly blocked or crashed)."
      );
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Send spreadsheet payload to GridCraft Web via host postMessage bridge
  const sendDocumentToGridCraft = useCallback(
    async (textPayload: string, docName: string) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      try {
        let buffer: ArrayBuffer | null = null;

        // If file exists on disk and is a binary XLSX, read binary bytes
        if (filePath && (filePath.toLowerCase().endsWith(".xlsx") || filePath.toLowerCase().endsWith(".xls"))) {
          try {
            const res = await apiFetch("/api/desktop/read-file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filePath }),
            });
            const json = await res.json();
            if (json?.content) {
              const binaryStr = atob(json.content.trim());
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              buffer = bytes.buffer;
            }
          } catch {}
        }

        if (!buffer && textPayload) {
          const trimmed = textPayload.trim();
          if (trimmed.startsWith("UEsDB") || trimmed.includes(";base64,")) {
            try {
              const rawB64 = trimmed.includes(";base64,") ? trimmed.split(";base64,")[1] : trimmed;
              const binaryStr = atob(rawB64.trim());
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              buffer = bytes.buffer;
            } catch {}
          } else if (trimmed.includes("|")) {
            // Markdown / Canvas pipe table parser -> convert to native XLSX buffer
            try {
              const normalized = trimmed.replace(/\|\|/g, "|\n|");
              const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
              const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
              const dataLines = tableLines.filter((l) => !(/^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(l)));
              const aoa = dataLines.map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
              if (aoa.length > 0) {
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
                const outArr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
                buffer = outArr;
              }
            } catch (err) {
              console.warn("[GridCraft] Failed to convert pipe table to xlsx:", err);
            }
          }

          if (!buffer) {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(textPayload);
            buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          }
        }

        iframe.contentWindow.postMessage(
          {
            type: "gridcraft:open",
            name: docName || "Spreadsheet.xlsx",
            bytes: buffer,
          },
          "*"
        );
        lastSentContentRef.current = textPayload;
      } catch (err) {
        console.warn("[GridCraft] Failed to send document buffer:", err);
      }
    },
    [filePath]
  );

  // Listen for official GridCraft host bridge events
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "gridcraft:ready") {
        setIsReady(true);
        setIsLoading(false);
        setLoadError(null);

        if (content || filePath) {
          sendDocumentToGridCraft(content, title);
        }
      } else if (data.type === "gridcraft:save") {
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
          console.warn("[GridCraft] Failed to process saved document bytes:", err);
        }
      } else if (data.type === "gridcraft:dirty") {
        if (onDirtyChangeRef.current) {
          onDirtyChangeRef.current(Boolean(data.dirty));
        }
      } else if (data.type === "gridcraft:failed") {
        setIsLoading(false);
        setLoadError(data.error || "Failed to initialize GridCraft WebAssembly runtime.");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [content, title, filePath, sendDocumentToGridCraft]);

  useEffect(() => {
    if (isReady && content && content !== lastSentContentRef.current) {
      sendDocumentToGridCraft(content, title);
    }
  }, [content, isReady, title, sendDocumentToGridCraft]);

  // Open native Microsoft Excel companion (Dual-Mode Architecture)
  const handleOpenNativeExcel = useCallback(async () => {
    if (!filePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openExcelNative) {
      await desktop.openExcelNative(filePath);
    } else if (desktop?.openPath) {
      await desktop.openPath(filePath);
    }
  }, [filePath]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#1f1f1f] overflow-hidden select-none">
      {/* 1. Loading State */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f3f2f1] dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#cf6613]" />
            <span className="text-sm font-medium tracking-tight">
              Loading ArtCraft GridCraft Suite...
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-mono">
            Initializing Pure-Rust WebAssembly engine & calculation grid
          </p>
        </div>
      )}

      {/* 2. Error Fallback State */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f3f2f1] dark:bg-[#18181b] p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
          <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
            Unable to Launch GridCraft Canvas
          </h3>
          <p className="text-xs text-neutral-500 max-w-md mb-4">{loadError}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsLoading(true);
                setLoadError(null);
                if (iframeRef.current) {
                  iframeRef.current.src = "/artcraft/gridcraft/index.html?host=parent&t=" + Date.now();
                }
              }}
              className="px-3.5 py-1.5 rounded-md bg-[#cf6613] text-white text-xs font-medium hover:bg-[#b5550f] transition-colors cursor-pointer"
            >
              Retry
            </button>
            {filePath && (
              <button
                onClick={handleOpenNativeExcel}
                className="px-3.5 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Native Excel
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Official GridCraft Pure-Rust WebAssembly Canvas */}
      <iframe
        ref={iframeRef}
        src="/artcraft/gridcraft/index.html?host=parent"
        title="ArtCraft GridCraft Suite"
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
