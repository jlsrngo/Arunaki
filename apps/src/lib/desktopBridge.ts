import { apiFetch } from "./api";

async function postDesktopJson(endpoint: string, body?: any): Promise<any> {
  try {
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[desktopBridge] Call to ${endpoint} failed:`, err);
    return null;
  }
}

export function initDesktopBridge(): void {
  if (typeof window === "undefined") return;

  const existing = (window as any).arunakiDesktop;
  if (existing?.getFolderTree && existing?.pickFolder) {
    return; // Already initialized by Electron or prior script
  }

  const tauri = (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__;

  (window as any).arunakiDesktop = {
    isDesktop: true,
    platform: "win32",
    runtime: "rust-tauri-axum",

    minimize: async () => {
      if (tauri?.invoke) {
        try { await tauri.invoke("window_minimize"); return; } catch {}
      }
      postDesktopJson("/api/desktop/minimize").catch(() => {});
    },

    maximize: async () => {
      if (tauri?.invoke) {
        try { await tauri.invoke("window_toggle_maximize"); return; } catch {}
      }
      postDesktopJson("/api/desktop/maximize").catch(() => {});
    },

    close: async () => {
      if (tauri?.invoke) {
        try { await tauri.invoke("window_close"); return; } catch {}
      }
      postDesktopJson("/api/desktop/quit").catch(() => {});
    },

    startDrag: () => {
      if (tauri?.invoke) {
        try { tauri.invoke("window_start_dragging"); } catch {}
      }
    },

    isMaximized: async () => false,
    onMaximizedChange: () => () => {},

    pickFolder: async () => {
      // 1. Try Tauri native command first
      if (tauri?.invoke) {
        try {
          const path = await tauri.invoke("pick_folder");
          if (path && typeof path === "string") {
            return { path };
          }
        } catch (e) {
          console.warn("[desktopBridge] tauri pick_folder failed, trying Axum engine:", e);
        }
      }
      // 2. Fallback to Axum engine endpoint
      const res = await postDesktopJson("/api/desktop/pick-folder", {});
      return { path: res?.path || null };
    },

    getFolderTree: async (folderPath: string) => {
      return postDesktopJson("/api/desktop/folder-tree", { folderPath });
    },

    readFile: async (filePath: string) => {
      return postDesktopJson("/api/desktop/read-file", { filePath });
    },

    writeFile: async (filePath: string, content: string) => {
      return postDesktopJson("/api/desktop/write-file", { filePath, content });
    },

    createFolder: async (folderPath: string) => {
      return postDesktopJson("/api/desktop/create-folder", { folderPath });
    },

    backupFolder: async (sourcePath?: string) => {
      const src = sourcePath || localStorage.getItem("arunaki_active_folder") || "";
      return postDesktopJson("/api/desktop/backup-folder", { sourcePath: src });
    },

    deletePath: async (targetPath: string) => {
      return postDesktopJson("/api/desktop/delete-path", { targetPath });
    },

    renamePath: async (oldPath: string, newPath: string) => {
      return postDesktopJson("/api/desktop/rename-path", { oldPath, newPath });
    },

    openPath: async (filePath: string) => {
      if (tauri?.invoke) {
        try { await tauri.invoke("open_path", { path: filePath }); return; } catch {}
      }
      return postDesktopJson("/api/desktop/open-path", { filePath });
    },

    openExcelNative: async (filePath: string) => {
      if (tauri?.invoke) {
        try { await tauri.invoke("open_excel_native", { path: filePath }); return; } catch {}
      }
      return postDesktopJson("/api/desktop/open-excel", { filePath });
    },

    openWordNative: async (filePath: string) => {
      if (tauri?.invoke) {
        try { await tauri.invoke("open_word_native", { path: filePath }); return; } catch {}
      }
      return postDesktopJson("/api/desktop/open-word", { filePath });
    },

    openPptNative: async (filePath: string) => {
      if (tauri?.invoke) {
        try { await tauri.invoke("open_ppt_native", { path: filePath }); return; } catch {}
      }
      return postDesktopJson("/api/desktop/open-ppt", { filePath });
    },

    parseExcel: async (filePath: string) => {
      return postDesktopJson("/api/desktop/parse-excel", { filePath });
    },

    parseWord: async (filePath: string) => {
      return postDesktopJson("/api/desktop/parse-word", { filePath });
    },

    parsePpt: async (filePath: string) => {
      return postDesktopJson("/api/desktop/parse-ppt", { filePath });
    },

    parsePdf: async (filePath: string, maxPages?: number) => {
      return postDesktopJson("/api/desktop/parse-pdf", { filePath, maxPages });
    },

    writeExcel: async (filePath: string, rows: any[], sheetName?: string) => {
      return postDesktopJson("/api/desktop/write-excel", { filePath, rows, sheetName });
    },

    readBinaryFile: async (filePath: string) => {
      return postDesktopJson("/api/desktop/read-binary", { filePath });
    },

    readClipboardImage: async () => {
      const res = await postDesktopJson("/api/desktop/read-clipboard-image", {});
      return res?.dataUrl || null;
    },

    getEngineInfo: async () => {
      try {
        const res = await apiFetch("/api/desktop/engine-info");
        return await res.json();
      } catch {
        return null;
      }
    },

    ping: () => Promise.resolve("desktop"),
  };
}
