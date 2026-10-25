import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { triggerKnowledgeSync, triggerKnowledgeSyncIfStale } from "../../../lib/knowledgeSync";
import { tauriPickFolder } from "../../../lib/api";

export function useActiveFolderSync() {
  const navigate = useNavigate();

  const [activeFolder, setActiveFolder] = useState<string>(() => {
    return localStorage.getItem("arunaki_active_folder") || "";
  });

  useEffect(() => {
    function loadActiveFolder() {
      setActiveFolder(localStorage.getItem("arunaki_active_folder") || "");
    }

    window.addEventListener("arunaki-folder-change", loadActiveFolder);
    window.addEventListener("storage", loadActiveFolder);
    return () => {
      window.removeEventListener("arunaki-folder-change", loadActiveFolder);
      window.removeEventListener("storage", loadActiveFolder);
    };
  }, []);

  // Workspace Switch — auto-sync knowledge sources on folder change (deferred slightly so initial UI paint is never blocked)
  useEffect(() => {
    if (!activeFolder) return;
    const timer = setTimeout(() => {
      triggerKnowledgeSync(activeFolder);
    }, 2500);
    return () => clearTimeout(timer);
  }, [activeFolder]);

  // Periodic Background Interval & Window Focus sync
  useEffect(() => {
    if (!activeFolder) return;

    // Periodic sync every 30 minutes
    const interval = setInterval(() => {
      triggerKnowledgeSync(activeFolder);
    }, 30 * 60 * 1000);

    // Auto-sync on window focus if last sync was > 15 minutes ago
    const handleFocus = () => {
      triggerKnowledgeSyncIfStale(15 * 60 * 1000, activeFolder);
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [activeFolder]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const selectedPath = await tauriPickFolder();
      if (selectedPath) {
        localStorage.setItem("arunaki_active_folder", selectedPath);
        setActiveFolder(selectedPath);

        // Strictly isolate active chat per folder
        const folderChatId =
          localStorage.getItem(`arunaki_active_chat_id_${selectedPath}`) || "";
        if (folderChatId) {
          localStorage.setItem("arunaki_active_chat_id", folderChatId);
        } else {
          localStorage.removeItem("arunaki_active_chat_id");
        }

        window.dispatchEvent(new Event("arunaki-folder-change"));
        window.dispatchEvent(new Event("arunaki-session-change"));

        const params = new URLSearchParams();
        params.set("folder", selectedPath);
        if (folderChatId) params.set("chatId", folderChatId);
        navigate(`/?${params.toString()}`);
      }
    } catch (err) {
      console.error("[useActiveFolderSync] Open folder error:", err);
    }
  }, [navigate]);

  const handleCloseFolder = useCallback(() => {
    localStorage.removeItem("arunaki_active_folder");
    localStorage.removeItem("arunaki_active_chat_id");
    setActiveFolder("");
    window.dispatchEvent(new Event("arunaki-folder-change"));
    window.dispatchEvent(new Event("arunaki-session-change"));
    navigate("/");
    toast.info("Folder closed. Agent is now in sandbox mode.");
  }, [navigate]);

  return {
    activeFolder,
    setActiveFolder,
    handleOpenFolder,
    handleCloseFolder,
  };
}
