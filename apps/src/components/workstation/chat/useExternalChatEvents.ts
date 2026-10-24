import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Message } from "./types";
import { LiveStatusData, StepItem, formatToolStepLabel } from "../LiveExecutionBadge";
import { subscribeEvents, mapEngineEvent, isSessionActive } from "../../../lib/engine";

interface UseExternalChatEventsOptions {
  activeChatId: string;
  activeFolder?: string;
  isStreaming: boolean;
  isLocalSendingRef: React.MutableRefObject<boolean>;
  isCompactingRef: React.MutableRefObject<boolean>;
  isStreamingRef: React.MutableRefObject<boolean>;
  setStreamingState: (val: boolean) => void;
  setLiveStatus: React.Dispatch<React.SetStateAction<LiveStatusData | null>>;
  setOptimisticMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  refetchFiles: () => void;
  reloadOpenTabsContent: () => void;
  chatMessages: Message[];
}

export function useExternalChatEvents({
  activeChatId,
  activeFolder,
  isStreaming,
  isLocalSendingRef,
  isCompactingRef,
  isStreamingRef,
  setStreamingState,
  setLiveStatus,
  setOptimisticMessages,
  refetchFiles,
  reloadOpenTabsContent,
  chatMessages,
}: UseExternalChatEventsOptions) {
  const queryClient = useQueryClient();

  // 1. Persistent background SSE event listener for the active session (captures external prompts)
  useEffect(() => {
    if (!activeChatId) return;

    const abortCtrl = new AbortController();
    let extSteps: StepItem[] = [];
    let extReasoning = "";
    let extText = "";
    let extStartTime = 0;
    const extAssistantId = `ext-asst-${activeChatId}`;

    subscribeEvents(
      (rawEvent) => {
        if (isLocalSendingRef.current || isCompactingRef.current) return;

        const event = mapEngineEvent(rawEvent, activeChatId);
        if (!event) return;

        if (event.type === "session_busy" || event.type === "thinking") {
          if (!isStreamingRef.current) {
            setStreamingState(true);
            extStartTime = Date.now();
            extSteps = [];
            extReasoning = "";
            extText = "";
            queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] });
          }
          setLiveStatus({
            type: "thinking",
            preview:
              typeof event.data === "string"
                ? event.data
                : "Analyzing request & documents...",
          });
        } else if (event.type === "reasoning_delta" && event.data) {
          if (!isStreamingRef.current) {
            setStreamingState(true);
            if (!extStartTime) extStartTime = Date.now();
            queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] });
          }
          extReasoning += event.data;
          const elapsed = extStartTime
            ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000))
            : 1;
          setOptimisticMessages([
            {
              id: extAssistantId,
              role: "assistant",
              content: extText,
              reasoning: extReasoning,
              executionSteps: extSteps.length > 0 ? [...extSteps] : undefined,
              thoughtSec: elapsed,
              createdAt: new Date().toISOString(),
            },
          ]);
        } else if (event.type === "tool_start" || event.type === "tool_preparing") {
          if (!isStreamingRef.current) {
            setStreamingState(true);
            if (!extStartTime) extStartTime = Date.now();
            queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] });
          }
          const toolName = event.data?.toolName || "action";
          const label = formatToolStepLabel(
            toolName,
            event.data?.args || event.data?.input,
            false
          );
          setLiveStatus({
            type: "tool_start",
            toolName,
            preview: label,
          });

          const stepId = event.data?.callID || `ext-tool-${extSteps.length}`;
          const existingStep = extSteps.find((s) => s.id === stepId);
          if (!existingStep) {
            extSteps.push({
              id: stepId,
              label,
              status: "running",
              iconType: "tool",
              toolName,
            });
          }

          const elapsed = extStartTime
            ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000))
            : 1;
          setOptimisticMessages([
            {
              id: extAssistantId,
              role: "assistant",
              content: extText,
              reasoning: extReasoning,
              executionSteps: [...extSteps],
              thoughtSec: elapsed,
              createdAt: new Date().toISOString(),
            },
          ]);
        } else if (event.type === "tool_live_status") {
          const stepId = event.data?.callID;
          if (stepId) {
            const st = extSteps.find((s) => s.id === stepId);
            if (st) {
              st.status = "completed";
              const rawInput = event.data?.args || event.data?.input;
              if (rawInput) {
                st.label = formatToolStepLabel(
                  st.toolName || event.data?.toolName || "action",
                  rawInput,
                  true
                );
              } else if (st.label) {
                st.label = st.label
                  .replace(/^Reading\b/i, "Explored")
                  .replace(/^Editing\b/i, "Edited")
                  .replace(/^Writing\b/i, "Created")
                  .replace(/^Running\b/i, "Executed");
              }
            }
          }
          const toolName = event.data?.toolName || "action";
          setLiveStatus({
            type: "tool_live_status",
            toolName,
            preview: event.data?.preview || `Completed ${toolName}`,
          });

          const elapsed = extStartTime
            ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000))
            : 1;
          setOptimisticMessages([
            {
              id: extAssistantId,
              role: "assistant",
              content: extText,
              reasoning: extReasoning,
              executionSteps: [...extSteps],
              thoughtSec: elapsed,
              createdAt: new Date().toISOString(),
            },
          ]);
          refetchFiles();
          reloadOpenTabsContent();
        } else if (event.type === "text_delta" && event.data) {
          if (!isStreamingRef.current) {
            setStreamingState(true);
            if (!extStartTime) extStartTime = Date.now();
          }
          extText += event.data;
          const elapsed = extStartTime
            ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000))
            : 1;
          setOptimisticMessages([
            {
              id: extAssistantId,
              role: "assistant",
              content: extText,
              reasoning: extReasoning,
              executionSteps: extSteps.length > 0 ? [...extSteps] : undefined,
              thoughtSec: elapsed,
              createdAt: new Date().toISOString(),
            },
          ]);
        } else if (event.type === "done" || event.type === "error") {
          setStreamingState(false);
          setLiveStatus(null);
          setOptimisticMessages([]);
          extSteps = [];
          extReasoning = "";
          extText = "";
          extStartTime = 0;
          queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] });
          refetchFiles();
          reloadOpenTabsContent();
        }
      },
      abortCtrl.signal,
      activeFolder || undefined
    );

    isSessionActive(activeChatId)
      .then((active) => {
        if (active && !isStreamingRef.current && !isLocalSendingRef.current) {
          setStreamingState(true);
          extStartTime = Date.now();
          setLiveStatus({
            type: "thinking",
            preview: "Processing document tasks...",
          });
        }
      })
      .catch(() => {});

    return () => {
      abortCtrl.abort();
    };
  }, [
    activeChatId,
    activeFolder,
    queryClient,
    refetchFiles,
    reloadOpenTabsContent,
    setStreamingState,
    isLocalSendingRef,
    isCompactingRef,
    isStreamingRef,
    setLiveStatus,
    setOptimisticMessages,
  ]);

  // 2. External stream watchdog & fallback poller
  useEffect(() => {
    if (!isStreaming || isLocalSendingRef.current || !activeChatId) return;

    const interval = setInterval(async () => {
      try {
        const active = await isSessionActive(activeChatId);
        if (!active && isStreamingRef.current && !isLocalSendingRef.current) {
          setStreamingState(false);
          setLiveStatus(null);
          setOptimisticMessages([]);
          queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] });
          refetchFiles();
          reloadOpenTabsContent();
        }
      } catch {}
    }, 2500);

    return () => clearInterval(interval);
  }, [
    isStreaming,
    activeChatId,
    queryClient,
    refetchFiles,
    reloadOpenTabsContent,
    setStreamingState,
    isLocalSendingRef,
    isStreamingRef,
    setLiveStatus,
    setOptimisticMessages,
  ]);

  // 3. Auto-detect in-flight prompt if last message is a recent user message without assistant reply
  useEffect(() => {
    if (
      isStreaming ||
      isLocalSendingRef.current ||
      !activeChatId ||
      chatMessages.length === 0
    )
      return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      const now = Date.now();
      const msgTime = lastMsg.createdAt ? new Date(lastMsg.createdAt).getTime() : 0;
      if (msgTime && now - msgTime < 120000) {
        if (now - msgTime < 30000 && !isStreamingRef.current) {
          setStreamingState(true);
          setLiveStatus({
            type: "thinking",
            preview: "Thinking...",
          });
        }
        isSessionActive(activeChatId)
          .then((active) => {
            if (active && !isStreamingRef.current && !isLocalSendingRef.current) {
              setStreamingState(true);
              setLiveStatus({
                type: "thinking",
                preview: "Arunaki is processing...",
              });
            } else if (
              !active &&
              now - msgTime >= 30000 &&
              isStreamingRef.current &&
              !isLocalSendingRef.current
            ) {
              setStreamingState(false);
              setLiveStatus(null);
            }
          })
          .catch(() => {});
      }
    }
  }, [chatMessages, isStreaming, activeChatId, setStreamingState, isLocalSendingRef, isStreamingRef, setLiveStatus]);
}
