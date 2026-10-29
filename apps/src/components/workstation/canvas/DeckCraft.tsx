import { useState, useCallback, useEffect, useRef, memo } from "react";
import { RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { apiFetch } from "../../../lib/api";
import { bindArtCraftIframeGuards } from "../../../lib/artcraftPreloader";

export interface DeckCraftProps {
  content: string;
  filePath?: string;
  activeFolder?: string;
  tabId?: string;
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
  activeFolder,
  tabId,
  title,
  onContentChange,
  onSave,
  onDirtyChange,
}: DeckCraftProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const resolvedFilePath = filePath
    ? filePath.includes(":") || filePath.startsWith("/") || filePath.startsWith("\\")
      ? filePath
      : activeFolder
      ? `${activeFolder.replace(/[\\/]+$/, "")}\\${filePath.replace(/^[\\/]+/, "")}`
      : filePath
    : activeFolder && title
    ? `${activeFolder.replace(/[\\/]+$/, "")}\\${title}`
    : undefined;

  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onSaveRef.current = onSave;
    onDirtyChangeRef.current = onDirtyChange;
  }, [onContentChange, onSave, onDirtyChange]);

  const lastSentContentRef = useRef<string | null>(null);
  const lastSavedB64Ref = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
  const pendingSilentSaveRef = useRef(false);

  const requestIframeSave = useCallback((silent = false) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    pendingSilentSaveRef.current = silent;
    const seq = ++saveSeqRef.current;
    iframe.contentWindow.postMessage({ type: "deckcraft:trigger-save" }, "*");
    if (fallbackSaveTimerRef.current) clearTimeout(fallbackSaveTimerRef.current);
    fallbackSaveTimerRef.current = setTimeout(() => {
      if (saveSeqRef.current === seq && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "deckcraft:click-save-btn" }, "*");
      }
    }, 160);
  }, []);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (fallbackSaveTimerRef.current) clearTimeout(fallbackSaveTimerRef.current);
    };
  }, []);

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
    async (textPayload: string, docName: string, forceReload = false) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      try {
        let buffer: ArrayBuffer | null = null;

        // If file exists on disk and is a PPTX, read binary bytes
        if (resolvedFilePath && (/\.(pptx|ppt|odp)$/i).test(resolvedFilePath)) {
          try {
            const res = await apiFetch("/api/desktop/read-file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filePath: resolvedFilePath, directory: activeFolder }),
            });
            const json = await res.json();
            if (json?.content) {
              const b64 = json.content.trim();
              if (!forceReload && lastSavedB64Ref.current && b64 === lastSavedB64Ref.current) {
                return;
              }
              const binaryStr = atob(b64);
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
          } else {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(textPayload);
            buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          }
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
    [resolvedFilePath, activeFolder]
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

        if (content || resolvedFilePath) {
          sendDocumentToDeckCraft(content, title);
        }
      } else if (data.type === "deckcraft:save") {
        saveSeqRef.current++;
        if (fallbackSaveTimerRef.current) clearTimeout(fallbackSaveTimerRef.current);
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        const isSilent = pendingSilentSaveRef.current;
        pendingSilentSaveRef.current = false;

        try {
          if (data.bytes) {
            const rawBytes = new Uint8Array(data.bytes);
            const isBinaryZip = rawBytes.length > 4 && rawBytes[0] === 0x50 && rawBytes[1] === 0x4b;

            if (isBinaryZip && resolvedFilePath) {
              let binaryStr = "";
              const chunkSize = 8192;
              for (let i = 0; i < rawBytes.length; i += chunkSize) {
                const chunk = rawBytes.subarray(i, i + chunkSize);
                binaryStr += String.fromCharCode.apply(null, chunk as any);
              }
              const b64 = btoa(binaryStr);
              lastSavedB64Ref.current = b64;
              apiFetch("/api/desktop/write-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  filePath: resolvedFilePath,
                  directory: activeFolder,
                  content: "data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64," + b64,
                }),
              }).then(() => {
                window.dispatchEvent(
                  new CustomEvent("arunaki:file.edited", { detail: { file: resolvedFilePath } })
                );
                if (!isSilent) {
                  toast.success(`Saved ${title} to local disk`, { id: `save-${title}` });
                }
              }).catch(() => {});
            } else {
              const decoder = new TextDecoder("utf-8", { fatal: false });
              const decodedText = decoder.decode(rawBytes);

              if (onContentChangeRef.current) {
                onContentChangeRef.current(decodedText);
              }
              if (onSaveRef.current) {
                onSaveRef.current();
              }
            }
          }
          if (onDirtyChangeRef.current) {
            onDirtyChangeRef.current(false);
          }
        } catch (err) {
          console.warn("[DeckCraft] Failed to process saved document bytes:", err);
        }
      } else if (data.type === "deckcraft:dirty" || data.type === "deckcraft:user-edit") {
        const isDirty = data.type === "deckcraft:user-edit" ? true : Boolean(data.dirty);
        if (onDirtyChangeRef.current) {
          onDirtyChangeRef.current(isDirty);
        }
        if (isDirty) {
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = setTimeout(() => {
            requestIframeSave(true);
          }, 950);
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
  }, [content, title, resolvedFilePath, activeFolder, sendDocumentToDeckCraft, requestIframeSave]);

  useEffect(() => {
    const handleTriggerSave = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (
        (tabId && detail?.tabId === tabId) ||
        (filePath && detail?.filePath === filePath) ||
        (title && detail?.title === title)
      ) {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        requestIframeSave(false);
      }
    };
    const handleDiffCleared = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.action !== "revert") return;
      const targetName = String(detail?.fileName || detail?.filePath || "").split(/[/\\]/).pop()?.toLowerCase();
      const myName = (title || filePath || "").split(/[/\\]/).pop()?.toLowerCase();
      if (targetName && myName && targetName === myName) {
        lastSavedB64Ref.current = null;
        sendDocumentToDeckCraft("", title, true);
      }
    };
    window.addEventListener("arunaki:artcraft-trigger-save", handleTriggerSave);
    window.addEventListener("arunaki:diff-cleared", handleDiffCleared);
    return () => {
      window.removeEventListener("arunaki:artcraft-trigger-save", handleTriggerSave);
      window.removeEventListener("arunaki:diff-cleared", handleDiffCleared);
    };
  }, [tabId, filePath, title, requestIframeSave, sendDocumentToDeckCraft]);

  useEffect(() => {
    if (isReady && content && content !== lastSentContentRef.current) {
      if (lastSavedB64Ref.current && content.trim() === lastSavedB64Ref.current) {
        lastSentContentRef.current = content;
        return;
      }
      sendDocumentToDeckCraft(content, title);
    }
  }, [content, isReady, title, sendDocumentToDeckCraft]);

  // Open native PowerPoint companion (Dual-Mode Architecture)
  const handleOpenNativePpt = useCallback(async () => {
    if (!resolvedFilePath) return;
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.openPath) {
      await desktop.openPath(resolvedFilePath);
    }
  }, [resolvedFilePath]);

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
            {resolvedFilePath && (
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
          bindArtCraftIframeGuards(iframeRef.current);
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
