import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Message } from "./types";
import { summarizeSession } from "../../../lib/engine";
import { sendDesktopNotification } from "../../../lib/notifications";

export const SMART_COMPACTION_PREF_KEY = "arunaki_pref_smart_compaction";
export const SMART_COMPACTION_EVENT = "arunaki:smart-compaction-changed";

export function setSmartCompactionPref(enabled: boolean) {
  try {
    localStorage.setItem(SMART_COMPACTION_PREF_KEY, String(enabled));
  } catch {}
  window.dispatchEvent(new Event(SMART_COMPACTION_EVENT));
}

interface UseChatCompactionOptions {
  activeChatId: string;
  chatMessages: Message[];
  isStreaming: boolean;
  activeModel: { providerID?: string; id?: string };
  activeFolder: string;
}

export function useChatCompaction({
  activeChatId,
  chatMessages: _chatMessages,
  isStreaming,
  activeModel,
  activeFolder,
}: UseChatCompactionOptions) {
  const queryClient = useQueryClient();
  const [isCompacting, setIsCompacting] = useState(false);
  const isCompactingRef = useRef(false);

  // Single source of truth shared with Settings > Automation toggle.
  const [isCompacted, setIsCompacted] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SMART_COMPACTION_PREF_KEY) !== "false";
  });

  useEffect(() => {
    const sync = () =>
      setIsCompacted(localStorage.getItem(SMART_COMPACTION_PREF_KEY) !== "false");
    const onStorage = (e: StorageEvent) => {
      if (e.key === SMART_COMPACTION_PREF_KEY) sync();
    };
    window.addEventListener(SMART_COMPACTION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SMART_COMPACTION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleCompactSession = useCallback(async () => {
    // Toggle OFF: disable smart compaction globally (syncs Settings)
    if (isCompacted) {
      setSmartCompactionPref(false);
      setIsCompacted(false);
      toast.info("Context compaction disabled.");
      return;
    }

    // Toggle ON: enable globally, then compact active session if possible
    setSmartCompactionPref(true);
    setIsCompacted(true);
    if (!activeChatId || isStreaming) {
      toast.info("Smart context compaction enabled.");
      return;
    }
    setIsCompacting(true);
    isCompactingRef.current = true;
    const toastId = toast.loading("Compacting session context...");
    try {
      const ok = await summarizeSession(activeChatId, activeModel, activeFolder);
      if (ok) {
        toast.success("Session context compacted", { id: toastId });
        void sendDesktopNotification(
          "Arunaki Workstation",
          "Session context compacted successfully (/compact active)."
        );
        await queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] });
      } else {
        toast.error("Failed to compact context", { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Compaction error: ${err?.message || err}`, { id: toastId });
    } finally {
      setIsCompacting(false);
      isCompactingRef.current = false;
    }
  }, [activeChatId, isStreaming, isCompacted, activeModel, activeFolder, queryClient]);

  return {
    isCompacting,
    isCompacted,
    handleCompactSession,
    isCompactingRef,
  };
}
