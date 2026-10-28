import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Message } from "./types";
import { summarizeSession } from "../../../lib/engine";
import { sendDesktopNotification } from "../../../lib/notifications";

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

  const [isCompacted, setIsCompacted] = useState<boolean>(() => {
    if (typeof window === "undefined" || !activeChatId) return false;
    return localStorage.getItem(`arunaki_compacted_${activeChatId}`) === "true";
  });

  useEffect(() => {
    if (!activeChatId) {
      setIsCompacted(false);
      return;
    }
    const saved = localStorage.getItem(`arunaki_compacted_${activeChatId}`);
    setIsCompacted(saved === "true");
  }, [activeChatId]);

  const handleCompactSession = useCallback(async () => {
    if (!activeChatId) {
      toast.error("No active session to compact");
      return;
    }
    if (isStreaming) {
      toast.warning("Please wait for current response to finish");
      return;
    }

    // Toggle OFF: if already compacted/active, turn it off cleanly
    if (isCompacted) {
      try {
        localStorage.setItem(`arunaki_compacted_${activeChatId}`, "disabled");
      } catch {}
      setIsCompacted(false);
      toast.info("Context compaction disabled.");
      return;
    }

    // Toggle ON: trigger compaction
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
        try {
          localStorage.setItem(`arunaki_compacted_${activeChatId}`, "true");
        } catch {}
        setIsCompacted(true);
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
