import { useState, useCallback, useEffect, useRef, memo } from "react";
import { ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { apiFetch } from "../../../lib/api";
import { bindArtCraftIframeGuards } from "../../../lib/artcraftPreloader";

export interface WordCraftProps {
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
 * WordCraft — Official ArtCraft Pure-Rust Document Suite (WASM Embedded Engine)
 * Dual-Mode Architecture: In-App WASM Suite + Native Desktop Microsoft Word Companion.
 *
 * Ensures all documents (.docx/.doc) are directly read from and written to
 * the local project folder on the user's computer hard disk.
 */
export const WordCraft = memo(function WordCraft({
  content,
  filePath,
  activeFolder,
  tabId,
  title,
  onContentChange,
  onSave,
  onDirtyChange,
}: WordCraftProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forceWebGL, setForceWebGL] = useState(false);

  const resolvedFilePath = filePath
    ? filePath.includes(":") || filePath.startsWith("/") || filePath.startsWith("\\")
      ? filePath
      : activeFolder
      ? `${activeFolder.replace(/[\\/]+$/, "")}\\${filePath.replace(/^[\\/]+/, "")}`
      : filePath
    : activeFolder && title
    ? `${activeFolder.replace(/[\\/]+$/, "")}\\${title}`
    : undefined;

  // Keep latest callbacks in ref to avoid re-subscribing message listener
  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onSaveRef.current = onSave;
    onDirtyChangeRef.current = onDirtyChange;
  }, [onContentChange, onSave, onDirtyChange]);

  const lastSentContentRef = useRef<string | null>(null);
  const lastSentPathRef = useRef<string | null>(null);
  const lastSavedB64Ref = useRef<string | null>(null);
  const isDispatchingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
  const pendingSilentSaveRef = useRef(false);

  const requestIframeSave = useCallback((silent = false) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    pendingSilentSaveRef.current = silent;
    const seq = ++saveSeqRef.current;
    iframe.contentWindow.postMessage({ type: "wordcraft:trigger-save" }, "*");
    if (fallbackSaveTimerRef.current) clearTimeout(fallbackSaveTimerRef.current);
    fallbackSaveTimerRef.current = setTimeout(() => {
      if (saveSeqRef.current === seq && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "wordcraft:click-save-btn" }, "*");
      }
    }, 160);
  }, []);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (fallbackSaveTimerRef.current) clearTimeout(fallbackSaveTimerRef.current);
    };
  }, []);

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
    async (textPayload: string, docName: string, forceReload = false) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;
      if (isDispatchingRef.current) return;
      isDispatchingRef.current = true;
      lastSentContentRef.current = textPayload;
      lastSentPathRef.current = resolvedFilePath || null;

      try {
        let buffer: ArrayBuffer | null = null;

        // 1. If physical file exists on disk, read binary bytes via /api/desktop/read-file
        if (resolvedFilePath && /\.(docx|doc|odt|rtf)$/i.test(resolvedFilePath)) {
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
                isDispatchingRef.current = false;
                return;
              }
              if (b64.startsWith("UEsDB")) {
                const binaryStr = atob(b64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                buffer = bytes.buffer;
              }
            }
          } catch (err) {
            console.warn("[WordCraft] Binary read fallback:", err);
          }
        }

        // 2. If payload is base64 (e.g. starts with UEsDB for zip/docx or data URL), or plain text/Markdown that needs .docx conversion
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
            // Convert plain text / Markdown into a real OOXML .docx binary via backend before sending to WordCraft WASM
            const targetDocPath =
              resolvedFilePath && /\.(docx)$/i.test(resolvedFilePath)
                ? resolvedFilePath
                : (docName || "Document 1.docx").endsWith(".docx")
                  ? docName || "Document 1.docx"
                  : `${docName || "Document 1"}.docx`;
            try {
              await apiFetch("/api/desktop/write-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  filePath: targetDocPath,
                  directory: activeFolder,
                  content: textPayload,
                }),
              });
              const res = await apiFetch("/api/desktop/read-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filePath: targetDocPath, directory: activeFolder }),
              });
              const json = await res.json();
              if (json?.content && json.content.trim().startsWith("UEsDB")) {
                const binaryStr = atob(json.content.trim());
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                buffer = bytes.buffer;
              }
            } catch {}
          }
        }

        iframe.contentWindow.postMessage(
          {
            type: "wordcraft:open",
            name: docName || "Document.docx",
            bytes: buffer,
            forceReload,
          },
          "*"
        );
        lastSentContentRef.current = textPayload;
        lastSentPathRef.current = resolvedFilePath || null;
      } catch (err) {
        console.warn("[WordCraft] Failed to send document buffer:", err);
      } finally {
        isDispatchingRef.current = false;
      }
    },
    [resolvedFilePath, activeFolder]
  );

  // Listen for official WordCraft host bridge events (?host=parent)
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || typeof data !== "object") return;

      // 1. App is up and ready for files
      if (data.type === "wordcraft:ready") {
        setIsReady(true);
        setIsLoading(false);
        setLoadError(null);
        // Synchronously record refs before re-render so secondary useEffect will not duplicate dispatch
        lastSentContentRef.current = content || "";
        lastSentPathRef.current = resolvedFilePath || null;
        sendDocumentToWordCraft(content || "", title);
      }
      else if (data.type === "wordcraft:document-ready") {
        setIsLoading(false);
      }

      // 2. User clicked Save (Ctrl+S or File > Save or Auto-Save)
      else if (data.type === "wordcraft:save") {
        saveSeqRef.current++;
        if (fallbackSaveTimerRef.current) clearTimeout(fallbackSaveTimerRef.current);
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        const isSilent = pendingSilentSaveRef.current;
        pendingSilentSaveRef.current = false;

        try {
          if (data.bytes) {
            const rawBytes = new Uint8Array(data.bytes);

            // SAVE DIRECTLY TO USER'S HARD DISK AS REAL .DOCX BINARY FILE!
            if (resolvedFilePath) {
              try {
                let binaryStr = "";
                const chunkSize = 8192;
                for (let i = 0; i < rawBytes.length; i += chunkSize) {
                  const chunk = rawBytes.subarray(i, i + chunkSize);
                  binaryStr += String.fromCharCode.apply(null, chunk as any);
                }
                const b64 = btoa(binaryStr);
                lastSavedB64Ref.current = b64;
                await apiFetch("/api/desktop/write-file", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    filePath: resolvedFilePath,
                    directory: activeFolder,
                    content: "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + b64,
                  }),
                });
                window.dispatchEvent(
                  new CustomEvent("arunaki:file.edited", { detail: { file: resolvedFilePath } })
                );
                if (!isSilent) {
                  toast.success(`Saved ${title} to local disk`, { id: `save-${title}` });
                }
              } catch (err) {
                console.error("[WordCraft] Failed to write binary file to disk:", err);
                if (!isSilent) {
                  toast.error("Failed to save .docx to computer disk");
                }
              }
            } else if (onSaveRef.current) {
              await onSaveRef.current();
            }
          }
          if (onDirtyChangeRef.current) {
            onDirtyChangeRef.current(false);
          }
        } catch (err) {
          console.warn("[WordCraft] Failed to process saved document bytes:", err);
        }
      }

      // 3. Document dirty status changes or user keystroke edit inside WordCraft
      else if (data.type === "wordcraft:dirty" || data.type === "wordcraft:user-edit") {
        const isDirty = data.type === "wordcraft:user-edit" ? true : Boolean(data.dirty);
        if (onDirtyChangeRef.current) {
          onDirtyChangeRef.current(isDirty);
        }
        if (isDirty) {
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = setTimeout(() => {
            requestIframeSave(true);
          }, 950);
        }
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
  }, [content, title, resolvedFilePath, activeFolder, sendDocumentToWordCraft, requestIframeSave]);

  // Listen for CenterTabHeader [Save] / Ctrl+S trigger & Source Control Revert
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
        sendDocumentToWordCraft("", title, true);
      }
    };
    window.addEventListener("arunaki:artcraft-trigger-save", handleTriggerSave);
    window.addEventListener("arunaki:diff-cleared", handleDiffCleared);
    return () => {
      window.removeEventListener("arunaki:artcraft-trigger-save", handleTriggerSave);
      window.removeEventListener("arunaki:diff-cleared", handleDiffCleared);
    };
  }, [tabId, filePath, title, requestIframeSave, sendDocumentToWordCraft]);

  // Sync external content or path updates
  useEffect(() => {
    if (isReady && (content !== lastSentContentRef.current || resolvedFilePath !== lastSentPathRef.current)) {
      if (content && lastSavedB64Ref.current && content.trim() === lastSavedB64Ref.current) {
        lastSentContentRef.current = content;
        lastSentPathRef.current = resolvedFilePath || null;
        return;
      }
      lastSentContentRef.current = content;
      lastSentPathRef.current = resolvedFilePath || null;
      sendDocumentToWordCraft(content || "", title);
    }
  }, [content, resolvedFilePath, isReady, title, sendDocumentToWordCraft]);

  // Open native Microsoft Word companion (Dual-Mode Architecture)
  const handleOpenNativeWord = useCallback(async () => {
    if (!filePath) return;
    try {
      const res = await apiFetch("/api/desktop/open-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (data?.error) {
        // Fallback to general open-path
        await apiFetch("/api/desktop/open-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath }),
        });
      }
      toast.success(`Opened ${title} in Microsoft Word`);
    } catch {
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      if (desktop?.openWordNative) {
        await desktop.openWordNative(filePath);
      } else if (desktop?.openPath) {
        await desktop.openPath(filePath);
      }
    }
  }, [filePath, title]);



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
            Reading document bytes from local disk & initializing engine
          </p>
        </div>
      )}

      {/* 2. Error Fallback State */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#f3f2f1] dark:bg-[#18181b] p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
          <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
            Unable to Launch In-App WordCraft Canvas
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

      {/* 3. Official WordCraft Pure-Rust WebAssembly Canvas */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="ArtCraft WordCraft Suite"
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
