import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Message, MessagePart, QuestionData } from "./types";
import { mapEngineMessages } from "./mapper";
import { LiveStatusData, StepItem, formatToolStepLabel } from "../LiveExecutionBadge";
import { extractCanvasContent, extractCanvasTitle } from "../canvas/canvas";
import { CanvasItem } from "../canvas/types";
import { isDocumentPath } from "../tabs/utils";
import {
  createSession,
  sendPrompt,
  subscribeEvents,
  mapEngineEvent,
  getMessages,
  getSession,
  switchSessionModel,
  replySessionQuestion,
  isSessionActive,
  interruptSession,
} from "../../../lib/engine";
import { API_BASE, apiFetch } from "../../../lib/api";

interface UseWorkstationChatOptions {
  activeFolder: string;
  activeChatId: string;
  setActiveChatId: (id: string) => void;
  refetchFiles: () => void;
  reloadOpenTabsContent: () => void;
  onOpenFileTab: (filePath: string, fileName: string, content?: string, silent?: boolean) => Promise<void>;
  upsertCanvasTab: (canvasText: string, isStreamingDone?: boolean) => void;
  setRecentCanvases?: React.Dispatch<React.SetStateAction<CanvasItem[]>>;
}

const EDIT_FILE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "write_excel",
  "edit_excel",
  "edit_document",
  "create_file",
]);

export function resolveActiveSingleModel(): { providerID: string; id: string } {
  let p = localStorage.getItem("arunaki_active_provider") || "kenari";

  // Guard against unauthenticated gemini / antigravity
  if (p === "gemini") {
    const geminiKey = localStorage.getItem("arunaki_gemini_api_key");
    if (!geminiKey || geminiKey === "antigravity-active") {
      p = "kenari";
    }
  }

  const specific =
    localStorage.getItem("arunaki_active_model") ||
    localStorage.getItem(`arunaki_provider_model_${p}`);
  if (specific && specific.trim()) {
    const trimmed = specific.trim();
    const firstModel = trimmed.includes(",") ? trimmed.split(",")[0].trim() : trimmed;
    if (firstModel && (p !== "kenari" || !firstModel.toLowerCase().includes("gemini"))) {
      return { providerID: p, id: firstModel };
    }
  }
  const pool = localStorage.getItem(`arunaki_provider_models_${p}`);
  if (pool && pool.trim()) {
    const list = pool
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0 && (p !== "kenari" || !list[0].toLowerCase().includes("gemini"))) {
      localStorage.setItem("arunaki_active_model", list[0]);
      return { providerID: p, id: list[0] };
    }
  }
  return {
    providerID: p,
    id: p === "kenari" ? "mimo-v2-5:free" : "default",
  };
}

export function useWorkstationChat({
  activeFolder,
  activeChatId,
  setActiveChatId,
  refetchFiles,
  reloadOpenTabsContent,
  onOpenFileTab,
  upsertCanvasTab,
  setRecentCanvases,
}: UseWorkstationChatOptions) {
  const queryClient = useQueryClient();

  const [reasoningEffort, setReasoningEffort] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("arunaki_reasoning_effort");
      if (saved) return saved;
      const showThinking = localStorage.getItem("arunaki_show_thinking") !== "false";
      return showThinking ? "high" : "";
    }
    return "high";
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const setStreamingState = useCallback((val: boolean) => {
    isStreamingRef.current = val;
    setIsStreaming(val);
  }, []);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<QuestionData | null>(null);
  const pendingQuestionRef = useRef<QuestionData | null>(null);
  const updatePendingQuestion = useCallback((q: QuestionData | null) => {
    pendingQuestionRef.current = q;
    setPendingQuestion(q);
  }, []);
  const [liveStatus, setLiveStatus] = useState<LiveStatusData | null>(null);
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([]);
  const queuedPromptsRef = useRef<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const producedFilesRef = useRef<string[]>([]);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const resetWatchdogRef = useRef<((timeoutMs?: number) => void) | null>(null);
  const currentTurnIdRef = useRef<string>("");
  const isLocalSendingRef = useRef(false);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearWatchdog();
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch {}
        abortControllerRef.current = null;
      }
    };
  }, [clearWatchdog]);

  // 1. Fetch chat messages from engine
  const { data: chatMessages = [] } = useQuery<Message[]>({
    queryKey: ["chat-messages", activeChatId],
    queryFn: async () => {
      if (!activeChatId) return [];
      try {
        const raw = await getMessages(activeChatId);
        return mapEngineMessages(raw || []);
      } catch {
        return [];
      }
    },
    enabled: !!activeChatId,
    refetchInterval: isStreaming ? false : 2500,
  });

  // Track external message updates (e.g. from Telegram gateway or external prompts)
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (chatMessages.length > prevMsgCountRef.current) {
      if (prevMsgCountRef.current > 0) {
        refetchFiles();
        reloadOpenTabsContent();
      }
      prevMsgCountRef.current = chatMessages.length;
    } else if (chatMessages.length < prevMsgCountRef.current) {
      prevMsgCountRef.current = chatMessages.length;
    }
  }, [chatMessages.length, refetchFiles, reloadOpenTabsContent]);

  // 2. Clear optimistic messages and abort any in-flight stream on folder/chat navigation changes
  const prevChatIdRef = useRef(activeChatId);
  const prevFolderRef = useRef(activeFolder);
  useEffect(() => {
    const chatChanged = prevChatIdRef.current !== activeChatId;
    const folderChanged = prevFolderRef.current !== activeFolder;
    prevChatIdRef.current = activeChatId;
    prevFolderRef.current = activeFolder;

    if (chatChanged || folderChanged) {
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch {}
        abortControllerRef.current = null;
      }
      currentTurnIdRef.current = "";
      isLocalSendingRef.current = false;
      setStreamingState(false);
      clearWatchdog();
      setLiveStatus(null);
      setOptimisticMessages([]);
      updatePendingQuestion(null);
    }
  }, [activeFolder, activeChatId, clearWatchdog, setStreamingState, updatePendingQuestion]);

  // 3. Smart, throttled auto-scroll on new messages (does not fight user scrolling up)
  const isAutoScrollScheduledRef = useRef(false);
  useEffect(() => {
    if (isAutoScrollScheduledRef.current) return;
    isAutoScrollScheduledRef.current = true;

    requestAnimationFrame(() => {
      isAutoScrollScheduledRef.current = false;
      const el = messagesEndRef.current;
      if (!el) return;

      const container = el.parentElement;
      if (!container) {
        el.scrollIntoView({ behavior: "auto" });
        return;
      }

      // If user is near bottom (< 160px) or user just sent a prompt / streaming ended, auto-scroll smoothly
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 160 || !isStreaming) {
        el.scrollIntoView({ behavior: "auto" });
      }
    });
  }, [chatMessages, optimisticMessages, isStreaming]);

  // 4. Network offline / online resilience listener
  useEffect(() => {
    const handleOffline = () => {
      if (isStreaming) {
        clearWatchdog();
        setLiveStatus({
          type: "thinking",
          preview: "Network disconnected — Waiting for internet connection...",
        });
        toast.warning("Network connection lost", {
          description: "Execution paused. Arunaki will resume automatically when reconnected.",
          duration: 5000,
        });
      }
    };

    const handleOnline = () => {
      if (isStreaming && activeChatId) {
        toast.success("Network connection restored", {
          description: "Resuming session stream...",
          duration: 3000,
        });
        setLiveStatus({
          type: "thinking",
          preview: "Reconnecting to AI stream...",
        });
        // Check if engine already finished processing while offline
        queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] }).then(async () => {
          try {
            const raw = await getMessages(activeChatId);
            const messages = mapEngineMessages(raw || []);
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
              setIsStreaming(false);
              setLiveStatus(null);
              setOptimisticMessages([]);
              return;
            }
          } catch {}
          // Still waiting for completion: reset watchdog to generous 90s
          resetWatchdogRef.current?.(90000);
        });
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [isStreaming, activeChatId, queryClient, clearWatchdog]);

  // 5. Restore Canvas from history on session load so center panel is populated with recent data
  const hasRestoredCanvasRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeChatId || isStreaming || chatMessages.length === 0) return;
    if (hasRestoredCanvasRef.current === activeChatId) return;
    hasRestoredCanvasRef.current = activeChatId;

    const sessionCanvases: CanvasItem[] = [];
    let latestCanvasText = "";

    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const msg = chatMessages[i];
      if (msg.role === "assistant" && msg.content) {
        const canvasContent = extractCanvasContent(msg.content);
        if (canvasContent) {
          if (!latestCanvasText) {
            latestCanvasText = canvasContent;
          }
          if (!sessionCanvases.some((c) => c.content.trim() === canvasContent.trim())) {
            const title = extractCanvasTitle(canvasContent);
            const createdAt = msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now();
            const timeStr = new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            sessionCanvases.push({
              id: `canvas-${createdAt}-${sessionCanvases.length}`,
              title,
              content: canvasContent,
              createdAt: msg.createdAt || new Date(createdAt).toISOString(),
              timeStr,
            });
          }
        }
      }
    }

    if (sessionCanvases.length > 0 && setRecentCanvases) {
      const top5 = sessionCanvases.slice(0, 5);
      setRecentCanvases(top5);
      try {
        localStorage.setItem(`arunaki_recent_canvases_${activeChatId}`, JSON.stringify(top5));
      } catch {}
    }

    if (latestCanvasText) {
      upsertCanvasTab(latestCanvasText, false);
    }
  }, [activeChatId, chatMessages, isStreaming, upsertCanvasTab, setRecentCanvases]);

  // 6. Persistent background SSE event listener for the active session (captures Telegram & external prompts)
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
        // If local user is actively driving the stream via desktop input box, let handleSendMessage manage it
        if (isLocalSendingRef.current) return;

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
            preview: typeof event.data === "string" ? event.data : "Analyzing request & documents...",
          });
        } else if (event.type === "reasoning_delta" && event.data) {
          if (!isStreamingRef.current) {
            setStreamingState(true);
            if (!extStartTime) extStartTime = Date.now();
            queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChatId] });
          }
          extReasoning += event.data;
          const elapsed = extStartTime ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000)) : 1;
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

          const elapsed = extStartTime ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000)) : 1;
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

          const elapsed = extStartTime ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000)) : 1;
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
          const elapsed = extStartTime ? Math.max(1, Math.round((Date.now() - extStartTime) / 1000)) : 1;
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

    // Initial check: if session is already running when component mounts or switches chats
    isSessionActive(activeChatId).then((active) => {
      if (active && !isStreamingRef.current && !isLocalSendingRef.current) {
        setStreamingState(true);
        extStartTime = Date.now();
        setLiveStatus({
          type: "thinking",
          preview: "Processing document tasks...",
        });
      }
    }).catch(() => {});

    return () => {
      abortCtrl.abort();
    };
  }, [activeChatId, activeFolder, queryClient, refetchFiles, reloadOpenTabsContent, setStreamingState]);

  // 7. External stream watchdog & fallback poller (ensures UI doesn't remain stuck if disconnected)
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
  }, [isStreaming, activeChatId, queryClient, refetchFiles, reloadOpenTabsContent, setStreamingState]);

  // 8. Auto-detect in-flight prompt if last message is a recent user message without assistant reply
  useEffect(() => {
    if (isStreaming || isLocalSendingRef.current || !activeChatId || chatMessages.length === 0) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      const now = Date.now();
      const msgTime = lastMsg.createdAt ? new Date(lastMsg.createdAt).getTime() : 0;
      if (msgTime && now - msgTime < 120000) {
        // If message was posted recently (< 30s) and there is no assistant reply yet, activate thinking indicator immediately
        if (now - msgTime < 30000 && !isStreamingRef.current) {
          setStreamingState(true);
          setLiveStatus({
            type: "thinking",
            preview: "Thinking...",
          });
        }
        isSessionActive(activeChatId).then((active) => {
          if (active && !isStreamingRef.current && !isLocalSendingRef.current) {
            setStreamingState(true);
            setLiveStatus({
              type: "thinking",
              preview: "Arunaki is processing...",
            });
          } else if (!active && now - msgTime >= 30000 && isStreamingRef.current && !isLocalSendingRef.current) {
            setStreamingState(false);
            setLiveStatus(null);
          }
        }).catch(() => {});
      }
    }
  }, [chatMessages, isStreaming, activeChatId, setStreamingState]);

  const handleRemoveQueuedPrompt = useCallback((index: number) => {
    queuedPromptsRef.current = queuedPromptsRef.current.filter((_, i) => i !== index);
    setQueuedPrompts([...queuedPromptsRef.current]);
  }, []);

  const handleCancelStream = useCallback(() => {
    clearWatchdog();
    updatePendingQuestion(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeChatId) {
      interruptSession(activeChatId).catch(() => {});
    }
    currentTurnIdRef.current = "";
    isLocalSendingRef.current = false;
    setStreamingState(false);
    setLiveStatus(null);
    toast.info("Generation stopped");
  }, [clearWatchdog, setStreamingState, updatePendingQuestion, activeChatId]);

  const handleNewChat = useCallback(async () => {
    clearWatchdog();
    updatePendingQuestion(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isLocalSendingRef.current = false;
    setStreamingState(false);
    setLiveStatus(null);
    setOptimisticMessages([]);
    hasRestoredCanvasRef.current = null;
    setRecentCanvases?.([]);

    // Immediately clear chat to blank state for instant feedback with 0 flicker
    setActiveChatId("");
    queryClient.setQueryData(["chat-messages", ""], []);
    localStorage.removeItem("arunaki_active_chat_id");
    if (activeFolder) {
      localStorage.removeItem(`arunaki_active_chat_id_${activeFolder}`);
    }

    const activeModel = resolveActiveSingleModel();
    const effectiveVariant = reasoningEffort || "medium";

    try {
      const session = await createSession({
        directory: activeFolder || undefined,
        model: { ...activeModel, variant: effectiveVariant },
      });
      if (session && session.id) {
        setActiveChatId(session.id);
        localStorage.setItem("arunaki_active_chat_id", session.id);
        if (activeFolder) {
          localStorage.setItem(`arunaki_active_chat_id_${activeFolder}`, session.id);
        }
        queryClient.setQueryData(["chat-messages", session.id], []);
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
      }
    } catch {
      setActiveChatId("");
    }
    toast.info("New conversation session ready");
  }, [activeFolder, setActiveChatId, queryClient]);

  const handleAnswerQuestion = useCallback(
    async (requestId: string, selectedAnswer: string) => {
      updatePendingQuestion(null);

      const targetChatId = activeChatId;
      if (!targetChatId) return;

      // Optimistically mark question as answered in existing messages
      setOptimisticMessages((prev) =>
        prev.map((m) => {
          const hasQPart = m.parts?.some(
            (p) => p.type === "question" && (p.data.id === requestId || !p.data.answered)
          );
          const hasQDirect = m.question && (m.question.id === requestId || !m.question.answered);
          if (!hasQPart && !hasQDirect) return m;

          const updatedParts = m.parts?.map((p) => {
            if (p.type === "question" && (p.data.id === requestId || !p.data.answered)) {
              return {
                ...p,
                data: {
                  ...p.data,
                  answered: true,
                  selectedAnswer,
                },
              };
            }
            return p;
          });

          return {
            ...m,
            parts: updatedParts,
            question: hasQDirect
              ? { ...m.question!, answered: true, selectedAnswer }
              : m.question,
          };
        })
      );

      // Create continuation optimistic assistant message so LiveActionIndicator ('Thinking...')
      // and live streamed tokens display immediately below the question card
      const continuationAssistantId = `asst-cont-${Date.now()}`;
      currentTurnIdRef.current = continuationAssistantId;

      setOptimisticMessages((prev) => [
        ...prev,
        {
          id: continuationAssistantId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        },
      ]);

      clearWatchdog();
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch {}
      }
      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;

      isLocalSendingRef.current = true;
      setStreamingState(true);
      resetWatchdogRef.current?.(120000);
      setLiveStatus({
        type: "thinking",
        preview: "Thinking...",
      });

      let accumulatedResponseText = "";
      let accumulatedReasoningText = "";
      let isFinalized = false;
      let answerRafId: number | null = null;

      const flushAnswerUi = () => {
        if (answerRafId !== null) {
          cancelAnimationFrame(answerRafId);
          answerRafId = null;
        }
        setLiveStatus({
          type: accumulatedReasoningText && !accumulatedResponseText ? "thinking" : "text_delta",
          preview: accumulatedReasoningText && !accumulatedResponseText ? "Thinking..." : "Generating response",
        });
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.id === continuationAssistantId
              ? {
                  ...m,
                  content: accumulatedResponseText,
                  reasoning: accumulatedReasoningText || m.reasoning,
                }
              : m
          )
        );
      };

      const scheduleAnswerUi = () => {
        if (answerRafId === null) {
          answerRafId = requestAnimationFrame(() => {
            answerRafId = null;
            flushAnswerUi();
          });
        }
      };

      const finalizeContinuation = async () => {
        if (isFinalized) return;
        isFinalized = true;
        if (answerRafId !== null) {
          cancelAnimationFrame(answerRafId);
          answerRafId = null;
        }
        flushAnswerUi();
        clearWatchdog();
        isLocalSendingRef.current = false;
        setStreamingState(false);
        setLiveStatus(null);
        try {
          abortCtrl.abort();
        } catch {}
        try {
          const raw = await getMessages(targetChatId);
          if (raw && raw.length > 0) {
            const mapped = mapEngineMessages(raw);
            queryClient.setQueryData(["chat-messages", targetChatId], mapped);
          }
        } catch {}
        setOptimisticMessages([]);
        queryClient.invalidateQueries({ queryKey: ["chat-messages", targetChatId] });
        refetchFiles();
        reloadOpenTabsContent();
      };

      try {
        // 1. Subscribe to SSE events for real-time deltas during continuation
        subscribeEvents(
          (rawEvent) => {
            if (currentTurnIdRef.current !== continuationAssistantId) return;
            const event = mapEngineEvent(rawEvent, targetChatId);
            if (!event) return;

            if (event.type === "reasoning_delta" && event.data) {
              resetWatchdogRef.current?.(120000);
              accumulatedReasoningText += event.data;
              scheduleAnswerUi();
            } else if (event.type === "thinking") {
              flushAnswerUi();
              resetWatchdogRef.current?.(120000);
              setLiveStatus({ type: "thinking", preview: event.data || "Thinking..." });
            } else if (
              event.type === "tool_start" ||
              event.type === "tool_preparing" ||
              event.type === "tool_live_status"
            ) {
              flushAnswerUi();
              resetWatchdogRef.current?.(120000);
              const toolName = event.data?.toolName || "action";
              const label = formatToolStepLabel(
                toolName,
                event.data?.args || event.data?.input,
                event.data?.status === "completed"
              );
              setLiveStatus({
                type: "tool_start",
                toolName,
                preview: label,
              });
              refetchFiles();
              reloadOpenTabsContent();
            } else if (event.type === "text_delta" && event.data) {
              resetWatchdogRef.current?.(120000);
              accumulatedResponseText += event.data;
              scheduleAnswerUi();
            } else if (event.type === "question_asked" && event.data) {
              flushAnswerUi();
              const qData: QuestionData = {
                id: event.data?.id || `que_${Date.now()}`,
                sessionID: targetChatId,
                questions: event.data?.questions || [],
                answered: false,
              };
              updatePendingQuestion(qData);
              setLiveStatus({ type: "thinking", preview: "Waiting for your choice or input..." });
            } else if (event.type === "done") {
              finalizeContinuation();
            } else if (event.type === "error") {
              finalizeContinuation();
            }
          },
          abortCtrl.signal,
          activeFolder
        );

        // 2. Deliver the user's answer to the engine
        const ok = await replySessionQuestion(targetChatId, requestId, [[selectedAnswer]]);
        if (!ok) {
          console.warn("[handleAnswerQuestion] replySessionQuestion could not deliver reply:", targetChatId, requestId);
        }

        // 3. Fallback active session status poller:
        // Ensures that even if SSE connection drops or is delayed, we track when the engine
        // transitions from running -> idle and immediately finalize without hanging.
        let pollCount = 0;
        let hasSeenRunning = false;
        const pollInterval = setInterval(async () => {
          if (isFinalized) {
            clearInterval(pollInterval);
            return;
          }
          pollCount++;
          try {
            const active = await isSessionActive(targetChatId);
            if (active) {
              hasSeenRunning = true;
            }

            // Once the session was confirmed running and now becomes inactive, the continuation turn finished!
            if (hasSeenRunning && !active) {
              clearInterval(pollInterval);
              finalizeContinuation();
              return;
            }

            // Periodic message refresh so partial progress is visible if stored in DB
            if (pollCount % 2 === 0) {
              const raw = await getMessages(targetChatId);
              if (raw && raw.length > 0) {
                const mapped = mapEngineMessages(raw);
                queryClient.setQueryData(["chat-messages", targetChatId], mapped);
              }
            }

            // Safety limit (180s)
            if (pollCount >= 180) {
              clearInterval(pollInterval);
              finalizeContinuation();
            }
          } catch {
            if (pollCount >= 180) {
              clearInterval(pollInterval);
              finalizeContinuation();
            }
          }
        }, 1000);
      } catch (err: any) {
        console.error("[useWorkstationChat] replySessionQuestion error:", err);
        toast.error(`Failed to submit answer: ${err?.message || err}`);
        finalizeContinuation();
      }
    },
    [
      activeChatId,
      activeFolder,
      clearWatchdog,
      setStreamingState,
      updatePendingQuestion,
      queryClient,
      refetchFiles,
      reloadOpenTabsContent,
    ]
  );

  const handleSendMessage = async (
    textToSend?: string,
    filesToSend?: Array<{ name: string; uri: string; mime?: string }>
  ) => {
    const userText = (textToSend !== undefined ? textToSend : "").trim();
    if ((!userText && (!filesToSend || filesToSend.length === 0)) || isStreamingRef.current) {
      if (textToSend) {
        queuedPromptsRef.current.push(userText);
        setQueuedPrompts([...queuedPromptsRef.current]);
        toast.info("Message queued and will be processed automatically");
      }
      return;
    }

    // If there is an active pending clarification question, route normal chat input as the answer
    if (pendingQuestionRef.current) {
      const activeQ = pendingQuestionRef.current;
      updatePendingQuestion(null);
      await handleAnswerQuestion(activeQ.id, userText);
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("Computer is offline", {
        description: "Please reconnect to the internet before sending instructions.",
        duration: 5000,
      });
      return;
    }

    clearWatchdog();
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {}
      abortControllerRef.current = null;
    }

    const userMessageId = `user-${Date.now()}-${Math.random()}`;
    const assistantMessageId = `asst-${Date.now()}-${Math.random()}`;
    currentTurnIdRef.current = assistantMessageId;

    const newUserMsg: Message = {
      id: userMessageId,
      role: "user",
      content: userText,
      files: filesToSend && filesToSend.length > 0 ? filesToSend : undefined,
      createdAt: new Date().toISOString(),
    };

    let accumulatedResponseText = "";
    let accumulatedReasoningText = "";
    let currentStepReasoningStart = Date.now();
    let isCurrentStepNewThought = true;
    let needsReasoningSeparator = false;
    let needsTextSeparator = false;
    const streamStartTime = Date.now();
    const accumulatedSteps: StepItem[] = [];
    const accumulatedParts: MessagePart[] = [];

    const newAssistantMsg: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      parts: [...accumulatedParts],
      createdAt: new Date().toISOString(),
    };

    setOptimisticMessages([newUserMsg, newAssistantMsg]);
    isLocalSendingRef.current = true;
    setStreamingState(true);
    producedFilesRef.current = [];
    setLiveStatus({ type: "thinking", preview: "Analyzing request & context" });

    const activeModel = resolveActiveSingleModel();

    let chatIdToUse = activeChatId;
    const effectiveVariant = reasoningEffort || "medium";

    // Strict Folder-Session Isolation Guard: verify that existing session matches activeFolder
    if (chatIdToUse && activeFolder) {
      try {
        const sess = await getSession(chatIdToUse);
        const sessDir = (sess?.directory || (sess as any)?.location?.directory || "").toLowerCase().replace(/\\/g, "/");
        const curDir = activeFolder.toLowerCase().replace(/\\/g, "/");
        if (sessDir && curDir && sessDir !== curDir) {
          console.warn(`[useWorkstationChat] Session ${chatIdToUse} (${sessDir}) does not match active folder (${curDir}). Creating fresh session for folder.`);
          chatIdToUse = "";
        }
      } catch {
        chatIdToUse = "";
      }
    }

    if (!chatIdToUse || !chatIdToUse.startsWith("ses_")) {
      try {
        const session = await createSession({
          directory: activeFolder || undefined,
          model: { ...activeModel, variant: effectiveVariant },
        });
        chatIdToUse = session.id;
        setActiveChatId(chatIdToUse);
        localStorage.setItem("arunaki_active_chat_id", chatIdToUse);
        if (activeFolder) {
          localStorage.setItem("arunaki_active_folder", activeFolder);
          localStorage.setItem(`arunaki_active_chat_id_${activeFolder}`, chatIdToUse);
        }
      } catch (err) {
        console.error("[useWorkstationChat] Failed to create session:", err);
        isLocalSendingRef.current = false;
        setStreamingState(false);
        setLiveStatus(null);
        setOptimisticMessages([]);
        toast.error("Failed to create a new conversation. Please try again.");
        return;
      }
    } else {
      switchSessionModel(chatIdToUse, { ...activeModel, variant: effectiveVariant }).catch(() => {});
    }

    let hasDispatchedNotification = false;
    const dispatchCompletionNotification = (toolsCount = 0) => {
      if (hasDispatchedNotification) return;
      hasDispatchedNotification = true;
      try {
        const isNotifEnabled = localStorage.getItem("arunaki_pref_desktop_notification") !== "false";
        if (!isNotifEnabled) return;

        const notifBody =
          toolsCount > 0
            ? `Executed ${toolsCount} document task${toolsCount > 1 ? "s" : ""} successfully.`
            : "Document response generated.";

        const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
        if (desktop?.notify) {
          desktop.notify({
            title: "Arunaki Workstation",
            body: notifBody,
          });
        } else if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification("Arunaki Workstation", { body: notifBody });
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((perm) => {
              if (perm === "granted") {
                new Notification("Arunaki Workstation", { body: notifBody });
              }
            });
          }
        }
      } catch (err) {
        console.warn("[useWorkstationChat] notification error:", err);
      }
    };

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    const processNext = () => {
      if (queuedPromptsRef.current.length > 0) {
        const nextPrompt = queuedPromptsRef.current.shift()!;
        setQueuedPrompts([...queuedPromptsRef.current]);
        setTimeout(() => {
          handleSendMessage(nextPrompt);
        }, 300);
      }
    };

    const getActiveProviderDiagnostic = async (): Promise<{
      hasConfiguredProvider: boolean;
      activeProviderName: string;
      modelName?: string;
    }> => {
      const activeModel = resolveActiveSingleModel();
      try {
        const res = await apiFetch(`${API_BASE}/providers`);
        if (res.ok) {
          const json = await res.json();
          const providers: any[] = json.data || [];
          if (providers.length === 0) {
            return { hasConfiguredProvider: false, activeProviderName: "" };
          }
          const savedActiveId = localStorage.getItem("arunaki_active_provider");
          const CLI_NAMES: Record<string, string> = {
            "claude-code": "Claude Code CLI",
            codex: "OpenAI Codex CLI",
            gemini: "Google Antigravity",
            opencode: "OpenCode Interpreter",
            "9router": "9Router Gateway",
          };
          if (savedActiveId && CLI_NAMES[savedActiveId]) {
            return {
              hasConfiguredProvider: true,
              activeProviderName: CLI_NAMES[savedActiveId],
              modelName: activeModel.id || localStorage.getItem("arunaki_active_model") || "CLI Agent",
            };
          }

          const active =
            providers.find((p) => p.id === savedActiveId) ||
            providers.find((p) => p.id === "kenari" || p.apiKey) ||
            providers[0];

          return {
            hasConfiguredProvider: true,
            activeProviderName: active?.name || active?.id || "AI Provider",
            modelName: activeModel.id,
          };
        }
      } catch {}

      const fallbackId = localStorage.getItem("arunaki_active_provider");
      const CLI_NAMES: Record<string, string> = {
        "claude-code": "Claude Code CLI",
        codex: "OpenAI Codex CLI",
        gemini: "Google Antigravity",
        opencode: "OpenCode Interpreter",
        "9router": "9Router Gateway",
      };
      return {
        hasConfiguredProvider: !!fallbackId,
        activeProviderName: (fallbackId && CLI_NAMES[fallbackId]) || (fallbackId === "kenari" ? "Kenari" : fallbackId || "AI Provider"),
        modelName: activeModel.id,
      };
    };

    const resetWatchdog = (timeoutMs = 90000) => {
      clearWatchdog();
      watchdogRef.current = setTimeout(async () => {
        if (currentTurnIdRef.current !== assistantMessageId) return;
        // If computer is offline, don't abort — wait for reconnect!
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setLiveStatus({
            type: "thinking",
            preview: "Network disconnected — Waiting for internet connection...",
          });
          return;
        }

        abortCtrl.abort();
        isLocalSendingRef.current = false;
        setStreamingState(false);
        setLiveStatus(null);

        // If response content was already received, never overwrite it with a timeout error!
        const hasReceivedData =
          accumulatedResponseText.trim().length > 0 ||
          accumulatedReasoningText.trim().length > 0 ||
          accumulatedSteps.length > 0 ||
          accumulatedParts.length > 0;

        if (hasReceivedData) {
          dispatchCompletionNotification(accumulatedSteps.filter((s) => s.iconType === "tool").length);
          queryClient.invalidateQueries({ queryKey: ["chat-messages", chatIdToUse] });
          setOptimisticMessages([]);
          processNext();
          return;
        }

        const diagnostic = await getActiveProviderDiagnostic();

        if (!diagnostic.hasConfiguredProvider) {
          toast.error("No AI Provider Configured", {
            description: "Please configure an active AI provider in File → Preferences → Settings.",
            duration: 8000,
          });
          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: `⚠️ **No Model Provider Configured:**\n\nNo active AI model provider is configured on this workstation.\n\n**Quick Fix:**\n1. Open **File → Preferences → Settings**.\n2. Add and connect your provider (e.g., **Kenari** or **OpenAI**) with a valid API key.\n3. Verify connection with **Test Ping** and ensure it is set to **Primary Active**.\n4. Return here to send your instruction.`,
                  }
                : m
            )
          );
        } else {
          const pName = diagnostic.activeProviderName || "AI Provider";
          toast.error(`Upstream Provider Timeout (${pName})`, {
            description: `The provider did not return a response within 90 seconds (server latency ~5000ms or queue delay).`,
            duration: 7000,
          });
          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: `⚠️ **Upstream Provider Timeout (${pName}):**\n\nNo response received from **${pName}** within 90 seconds.\n\n**Diagnostics:**\n- Upstream server latency is high (~5000ms ping) or server queue is currently experiencing heavy load.\n${diagnostic.modelName ? `- Active Model: \`${diagnostic.modelName}\`\n` : ""}\n**Recommendations:**\n1. **Try sending again:** Free model queues often clear within 1-2 minutes.\n2. **Switch model:** In **File → Preferences → Settings**, select another fast model from the model pool.\n3. Verify provider status with **Test Ping** in Settings.`,
                  }
                : m
            )
          );
        }

        processNext();
      }, timeoutMs);
    };

    resetWatchdogRef.current = resetWatchdog;
    resetWatchdog(90000);

    let textEndFinalizeTimeout: any = null;
    let rafUpdateId: number | null = null;

    const flushThrottledUpdate = () => {
      if (rafUpdateId !== null) {
        cancelAnimationFrame(rafUpdateId);
        rafUpdateId = null;
      }

      let displayReasoning = accumulatedReasoningText;
      let displayText = accumulatedResponseText;

      // Extract <think> blocks from inline content when <think> tag is present.
      if (displayText.includes("<think>")) {
        const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
        let extractedReasoning = "";
        let cleanedText = displayText;
        let match;
        while ((match = thinkRegex.exec(displayText)) !== null) {
          extractedReasoning += (extractedReasoning ? "\n\n" : "") + match[1].trim();
        }
        cleanedText = displayText.replace(thinkRegex, "").trim();

        const lastOpenThink = cleanedText.lastIndexOf("<think>");
        if (lastOpenThink >= 0) {
          const beforeThink = cleanedText.substring(0, lastOpenThink).trim();
          const afterThink = cleanedText.substring(lastOpenThink + 7).trim();
          extractedReasoning += (extractedReasoning ? "\n\n" : "") + afterThink;
          cleanedText = beforeThink;
        }

        if (extractedReasoning) {
          accumulatedReasoningText = extractedReasoning;
          displayReasoning = extractedReasoning;
          displayText = cleanedText;
          const thoughtPart = accumulatedParts.find((p) => p.type === "thought");
          if (thoughtPart && thoughtPart.type === "thought") {
            thoughtPart.text = extractedReasoning;
          } else {
            accumulatedParts.unshift({ type: "thought", text: extractedReasoning });
          }
          const lastTextPart = accumulatedParts[accumulatedParts.length - 1];
          if (lastTextPart && lastTextPart.type === "text") {
            lastTextPart.text = displayText;
          }
        }
      }

      setLiveStatus({
        type: displayReasoning && !displayText ? "thinking" : "text_delta",
        preview: displayReasoning && !displayText ? "Thinking..." : "Generating response",
      });

      setOptimisticMessages((prev) => {
        const exists = prev.some((m) => m.id === assistantMessageId);
        if (!exists) {
          return [
            ...prev,
            {
              id: assistantMessageId,
              role: "assistant",
              content: displayText,
              reasoning: displayReasoning || undefined,
              createdAt: new Date().toISOString(),
              executionSteps: accumulatedSteps.length > 0 ? [...accumulatedSteps] : undefined,
              parts: [...accumulatedParts],
            },
          ];
        }
        return prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: displayText,
                reasoning: displayReasoning || m.reasoning,
                executionSteps: accumulatedSteps.length > 0 ? [...accumulatedSteps] : m.executionSteps,
                parts: [...accumulatedParts],
              }
            : m
        );
      });
    };

    const scheduleThrottledUpdate = () => {
      if (rafUpdateId === null) {
        rafUpdateId = requestAnimationFrame(() => {
          rafUpdateId = null;
          flushThrottledUpdate();
        });
      }
    };

    const finalizeDone = (doneData?: any) => {
      if (currentTurnIdRef.current !== assistantMessageId) return;
      if (!isStreamingRef.current) return;
      if (rafUpdateId !== null) {
        cancelAnimationFrame(rafUpdateId);
        rafUpdateId = null;
      }
      flushThrottledUpdate();
      clearWatchdog();
      if (textEndFinalizeTimeout) {
        clearTimeout(textEndFinalizeTimeout);
        textEndFinalizeTimeout = null;
      }
      isLocalSendingRef.current = false;
      setStreamingState(false);
      setLiveStatus(null);
      const elapsedSec = Math.max(1, Math.round((Date.now() - streamStartTime) / 1000));
      if (!accumulatedReasoningText && accumulatedResponseText.includes("<think>")) {
        const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
        let match;
        while ((match = thinkRegex.exec(accumulatedResponseText)) !== null) {
          accumulatedReasoningText += (accumulatedReasoningText ? "\n\n" : "") + match[1].trim();
        }
        accumulatedResponseText = accumulatedResponseText.replace(thinkRegex, "").trim();
      }
      if (accumulatedReasoningText.trim()) {
        const hasExistingThoughts = accumulatedParts.some((p) => p.type === "thought");
        if (!hasExistingThoughts) {
          accumulatedParts.unshift({
            type: "thought",
            text: accumulatedReasoningText.trim(),
            durationSec: elapsedSec,
          });
        }
      } else {
        const thoughtIdx = accumulatedParts.findIndex((p) => p.type === "thought");
        if (thoughtIdx >= 0) {
          accumulatedParts.splice(thoughtIdx, 1);
        }
      }

      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: accumulatedResponseText || m.content,
                reasoning: accumulatedReasoningText || m.reasoning,
                executionSteps: accumulatedSteps.length > 0 ? [...accumulatedSteps] : undefined,
                thoughtSec: elapsedSec,
                parts: [...accumulatedParts],
              }
            : m
        )
      );

      // Desktop OS Notification
      const completedToolsCount = doneData?.toolOutputs?.length || accumulatedSteps.filter((s) => s.iconType === "tool").length;
      dispatchCompletionNotification(completedToolsCount);

      // Auto-backup + auto-open produced documents
      const autoOpenOffice =
        localStorage.getItem("arunaki_pref_auto_open_office") === "true" ||
        localStorage.getItem("arunaki_pref_auto_open_excel") === "true";
      const autoBackup = localStorage.getItem("arunaki_pref_auto_backup") !== "false";
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      const toolsCount = doneData?.toolOutputs?.length || 0;
      const produced = producedFilesRef.current.filter(isDocumentPath);

      if (autoBackup && toolsCount > 0) {
        if (desktop?.backupFolder) {
          desktop.backupFolder().then((r: any) => {
            if (r?.success) toast.success("Workspace backed up automatically");
            else if (r?.error) toast.error(`Auto-backup failed: ${r.error}`);
          }).catch(() => {});
        }
      }

      if (autoOpenOffice && produced.length > 0 && desktop?.openPath) {
        for (const doc of produced) {
          try {
            if ((/\.(xlsx|xls|xlsm|csv)$/i).test(doc) && desktop.openExcelNative) {
              desktop.openExcelNative(doc);
            } else if ((/\.(docx|doc|rtf)$/i).test(doc) && desktop.openWordNative) {
              desktop.openWordNative(doc);
            } else {
              desktop.openPath(doc);
            }
          } catch {}
        }
      }

      const canvasText = extractCanvasContent(accumulatedResponseText || doneData?.content || "");
      if (canvasText) {
        upsertCanvasTab(canvasText, true);
      }

      queryClient.invalidateQueries({ queryKey: ["chat-messages", chatIdToUse] }).then(() => {
        setOptimisticMessages([]);
      });
      refetchFiles();
      reloadOpenTabsContent();
      setTimeout(() => {
        try {
          abortCtrl.abort();
        } catch {}
      }, 300);
      processNext();
    };

    try {
      subscribeEvents((rawEvent) => {
        if (currentTurnIdRef.current !== assistantMessageId) {
          try {
            abortCtrl.abort();
          } catch {}
          return;
        }
        const event = mapEngineEvent(rawEvent, chatIdToUse);
        if (!event) return;

        if (event.type === "reasoning_delta" && event.data) {
          resetWatchdog(90000);
          if (textEndFinalizeTimeout) {
            clearTimeout(textEndFinalizeTimeout);
            textEndFinalizeTimeout = null;
          }
          if (needsReasoningSeparator && accumulatedReasoningText.trim().length > 0) {
            accumulatedReasoningText += "\n\n";
            needsReasoningSeparator = false;
          }
          accumulatedReasoningText += event.data;

          const lastPart = accumulatedParts[accumulatedParts.length - 1];
          if (!isCurrentStepNewThought && lastPart && lastPart.type === "thought") {
            lastPart.text += event.data;
          } else {
            isCurrentStepNewThought = false;
            accumulatedParts.push({
              type: "thought",
              text: event.data,
              durationSec: 1,
            });
          }

          scheduleThrottledUpdate();
        } else if (event.type === "reasoning_end") {
          flushThrottledUpdate();
          resetWatchdog(90000);
          if (event.data && typeof event.data === "string") {
            if (needsReasoningSeparator && accumulatedReasoningText.trim().length > 0) {
              accumulatedReasoningText += "\n\n" + event.data;
              needsReasoningSeparator = false;
            } else if (!accumulatedReasoningText) {
              accumulatedReasoningText = event.data;
            }
          }
          const stepElapsedMs = Date.now() - currentStepReasoningStart;
          const stepElapsedSec = Math.max(1, Math.round(stepElapsedMs / 1000));
          const lastThought = [...accumulatedParts].reverse().find((p) => p.type === "thought");
          if (lastThought && lastThought.type === "thought") {
            lastThought.durationSec = stepElapsedSec;
            lastThought.durationMs = stepElapsedMs;
          }
          setLiveStatus({ type: "text_delta", preview: "Generating response" });
          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    reasoning: accumulatedReasoningText || m.reasoning,
                    thoughtSec: stepElapsedSec,
                    thoughtMs: stepElapsedMs,
                    parts: [...accumulatedParts],
                  }
                : m
            )
          );
        } else if (event.type === "step_continuation") {
          flushThrottledUpdate();
          resetWatchdog(120000);
          needsReasoningSeparator = true;
          needsTextSeparator = true;
          isCurrentStepNewThought = true;
          currentStepReasoningStart = Date.now();
          if (textEndFinalizeTimeout) {
            clearTimeout(textEndFinalizeTimeout);
            textEndFinalizeTimeout = null;
          }
          setLiveStatus({
            type: "thinking",
            preview: "Thinking...",
          });
        } else if (event.type === "thinking") {
          flushThrottledUpdate();
          resetWatchdog(90000);
          const label = event.data || "Analyzing request & context";
          setLiveStatus({ type: "thinking", preview: label });
          if (!accumulatedSteps.some((s) => s.label === label)) {
            accumulatedSteps.push({
              id: `${Date.now()}-${Math.random()}`,
              label,
              status: "completed",
              iconType: "thinking",
            });
          }
        } else if (event.type === "tool_preparing") {
          flushThrottledUpdate();
          if (textEndFinalizeTimeout) {
            clearTimeout(textEndFinalizeTimeout);
            textEndFinalizeTimeout = null;
          }
          resetWatchdog(120000);
          const toolName = event.data?.toolName || "action";
          if (toolName.toLowerCase() === "question") {
            return;
          }
          const callId = event.data?.callID;
          const label = formatToolStepLabel(toolName, event.data?.args || event.data?.input, false);
          setLiveStatus({ type: "tool_preparing", toolName, preview: label });

          const existingStep = accumulatedSteps.find(
            (s) => s.iconType === "tool" && (callId ? s.id === callId : s.status === "running" || s.toolName === toolName)
          );
          if (existingStep) {
            existingStep.label = label;
            existingStep.status = "running";
            existingStep.toolName = toolName;
          } else {
            const toolStepId = callId || `${Date.now()}-${Math.random()}`;
            accumulatedSteps.push({
              id: toolStepId,
              label,
              status: "running",
              iconType: "tool",
              toolName,
            });
          }

          const existingToolPart = accumulatedParts.find(
            (p) => p.type === "tool" && (callId ? p.step.id === callId : p.step.status === "running" || p.step.toolName === toolName)
          );
          if (existingToolPart && existingToolPart.type === "tool") {
            existingToolPart.step.label = label;
            existingToolPart.step.status = "running";
            existingToolPart.step.toolName = toolName;
          } else {
            accumulatedParts.push({
              type: "tool",
              step: {
                id: callId || `${Date.now()}-${Math.random()}`,
                label,
                status: "running",
                iconType: "tool",
                toolName,
              },
            });
          }

          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    executionSteps: [...accumulatedSteps],
                    parts: [...accumulatedParts],
                  }
                : m
            )
          );
        } else if (event.type === "tool_live_status" || event.type === "tool_start" || event.type === "tool_progress") {
          flushThrottledUpdate();
          if (textEndFinalizeTimeout) {
            clearTimeout(textEndFinalizeTimeout);
            textEndFinalizeTimeout = null;
          }
          resetWatchdog(120000);
          const toolName = event.data?.toolName || "action";
          if (toolName.toLowerCase() === "question") {
            return;
          }
          const callId = event.data?.callID;
          const isFinished = event.data?.status === "completed" || event.data?.status === "failed";
          const rawArgs = event.data?.args || event.data?.input;
          const label = rawArgs
            ? formatToolStepLabel(toolName, rawArgs, isFinished)
            : undefined;
          setLiveStatus({
            type: event.type === "tool_live_status" ? "tool_live_status" : "tool_start",
            ...event.data,
            toolName,
            preview: label || event.data?.preview || `${isFinished ? "Completed" : "Running"} ${toolName}`,
          });

          const finalStatus: "completed" | "running" = isFinished ? "completed" : "running";
          const existingStep = accumulatedSteps.find(
            (s) => s.iconType === "tool" && (callId ? s.id === callId : s.status === "running" || s.toolName === toolName)
          );
          if (existingStep) {
            if (label) {
              existingStep.label = label;
            } else if (isFinished && existingStep.label) {
              existingStep.label = existingStep.label
                .replace(/^Reading\b/i, "Explored")
                .replace(/^Editing\b/i, "Edited")
                .replace(/^Writing\b/i, "Created")
                .replace(/^Running\b/i, "Executed");
            }
            existingStep.status = finalStatus;
            existingStep.toolName = toolName;
          } else {
            accumulatedSteps.push({
              id: callId || `${Date.now()}-${Math.random()}`,
              label: label || formatToolStepLabel(toolName, undefined, isFinished),
              status: finalStatus,
              iconType: "tool",
              toolName,
            });
          }

          const existingToolPart = accumulatedParts.find(
            (p) => p.type === "tool" && (callId ? p.step.id === callId : p.step.status === "running" || p.step.toolName === toolName)
          );
          if (existingToolPart && existingToolPart.type === "tool") {
            if (label) {
              existingToolPart.step.label = label;
            } else if (isFinished && existingToolPart.step.label) {
              existingToolPart.step.label = existingToolPart.step.label
                .replace(/^Reading\b/i, "Explored")
                .replace(/^Editing\b/i, "Edited")
                .replace(/^Writing\b/i, "Created")
                .replace(/^Running\b/i, "Executed");
            }
            existingToolPart.step.status = finalStatus;
            existingToolPart.step.toolName = toolName;
          } else {
            accumulatedParts.push({
              type: "tool",
              step: {
                id: callId || `${Date.now()}-${Math.random()}`,
                label: label || formatToolStepLabel(toolName, undefined, isFinished),
                status: finalStatus,
                iconType: "tool",
                toolName,
              },
            });
          }

          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    executionSteps: [...accumulatedSteps],
                    parts: [...accumulatedParts],
                  }
                : m
            )
          );
          refetchFiles();
          reloadOpenTabsContent();

          // Auto-open file tab in center panel ONLY if AI is actively editing/writing a document!
          const isEditingTool = EDIT_FILE_TOOLS.has(toolName.toLowerCase());
          const toolData = event.data || {};
          const targetPath =
            toolData.args?.TargetFile ||
            toolData.args?.path ||
            toolData.args?.targetFile ||
            toolData.targetFile ||
            toolData.path;

          if (isEditingTool && targetPath && typeof targetPath === "string") {
            const fileName = targetPath.split(/[/\\]/).pop();
            if (fileName && fileName.includes(".") && fileName !== "." && fileName !== ".." && fileName !== activeFolder) {
              onOpenFileTab(targetPath, fileName, undefined, true);
              if (isDocumentPath(targetPath) && !producedFilesRef.current.includes(targetPath)) {
                producedFilesRef.current.push(targetPath);
              }
            }
          }
        } else if (event.type === "question_asked" && event.data) {
          flushThrottledUpdate();
          if (textEndFinalizeTimeout) {
            clearTimeout(textEndFinalizeTimeout);
            textEndFinalizeTimeout = null;
          }
          resetWatchdog(120000);
          const qData: QuestionData = {
            id: event.data?.id || `que_${Date.now()}`,
            sessionID: chatIdToUse,
            questions: event.data?.questions || [],
            answered: false,
          };
          updatePendingQuestion(qData);

          const existingQIdx = accumulatedParts.findIndex((p) => p.type === "question");
          if (existingQIdx >= 0) {
            const prevQ = accumulatedParts[existingQIdx] as { type: "question"; data: QuestionData };
            const finalId =
              qData.id.startsWith("que_")
                ? qData.id
                : prevQ.data?.id?.startsWith("que_")
                ? prevQ.data.id
                : qData.id;
            accumulatedParts[existingQIdx] = { type: "question", data: { ...qData, id: finalId } };
          } else {
            accumulatedParts.push({ type: "question", data: qData });
          }

          setLiveStatus({
            type: "thinking",
            preview: "Waiting for your choice or input...",
          });

          setOptimisticMessages((prev) => {
            const exists = prev.some((m) => m.id === assistantMessageId);
            if (!exists) {
              return [
                ...prev,
                {
                  id: assistantMessageId,
                  role: "assistant",
                  content: accumulatedResponseText,
                  reasoning: accumulatedReasoningText || undefined,
                  createdAt: new Date().toISOString(),
                  executionSteps: accumulatedSteps.length > 0 ? [...accumulatedSteps] : undefined,
                  parts: [...accumulatedParts],
                  question: qData,
                },
              ];
            }
            return prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    parts: [...accumulatedParts],
                    question: qData,
                  }
                : m
            );
          });
        } else if (event.type === "question_settled") {
          flushThrottledUpdate();
          resetWatchdog(90000);
          updatePendingQuestion(null);
          const reqId = event.data?.id;
          const answer = event.data?.answers?.[0]?.[0];
          for (const p of accumulatedParts) {
            if (p.type === "question" && (!reqId || p.data.id === reqId)) {
              p.data.answered = true;
              if (answer) p.data.selectedAnswer = answer;
            }
          }
          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    parts: [...accumulatedParts],
                    question: m.question
                      ? {
                          ...m.question,
                          answered: true,
                          selectedAnswer: answer || m.question.selectedAnswer,
                        }
                      : undefined,
                  }
                : m
            )
          );
        } else if (event.type === "text_delta" && event.data) {
          resetWatchdog(90000);
          if (textEndFinalizeTimeout) {
            clearTimeout(textEndFinalizeTimeout);
            textEndFinalizeTimeout = null;
          }
          if (needsTextSeparator && accumulatedResponseText.trim().length > 0) {
            accumulatedResponseText += "\n\n";
            needsTextSeparator = false;
          }
          accumulatedResponseText += event.data;

          let lastTextPart = accumulatedParts[accumulatedParts.length - 1];
          if (!lastTextPart || lastTextPart.type !== "text") {
            lastTextPart = { type: "text", text: "" };
            accumulatedParts.push(lastTextPart);
          }
          lastTextPart.text += event.data;

          const canvasText = extractCanvasContent(accumulatedResponseText);
          if (canvasText) {
            upsertCanvasTab(canvasText, false);
          }

          scheduleThrottledUpdate();
        } else if (event.type === "text_end") {
          flushThrottledUpdate();
          if (event.data && typeof event.data === "string") {
            if (needsTextSeparator && accumulatedResponseText.trim().length > 0) {
              accumulatedResponseText += "\n\n" + event.data;
              needsTextSeparator = false;
            } else if (!accumulatedResponseText) {
              accumulatedResponseText = event.data;
            }
            flushThrottledUpdate();
          }
          const hasToolSteps = accumulatedSteps.some((s) => s.iconType === "tool");
          const hasRunningTool = accumulatedSteps.some((s) => s.status === "running");
          const hasQuestionPart = accumulatedParts.some((p) => p.type === "question");
          if (!hasToolSteps && !hasRunningTool && !hasQuestionPart) {
            // For simple conversation without tools, finalize if 'done' hasn't arrived
            if (textEndFinalizeTimeout) clearTimeout(textEndFinalizeTimeout);
            textEndFinalizeTimeout = setTimeout(() => {
              finalizeDone();
            }, 800);
          } else {
            // In a tool-based or question turn, intermediate text has finished; engine is now running tools
            // or waiting for question choice. Keep live status active so the user sees progress!
            needsTextSeparator = true;
            needsReasoningSeparator = true;
            if (!hasQuestionPart) {
              setLiveStatus({
                type: "thinking",
                preview: "Analyzing data & preparing next response...",
              });
            }
          }
        } else if (event.type === "done") {
          // Finalize all remaining tool steps to completed when engine turn finishes
          for (const s of accumulatedSteps) {
            if (s.status === "running") {
              s.status = "completed";
              s.label = formatToolStepLabel(s.toolName || "action", undefined, true);
            }
          }
          for (const p of accumulatedParts) {
            if (p.type === "tool" && p.step.status === "running") {
              p.step.status = "completed";
              p.step.label = formatToolStepLabel(p.step.toolName || "action", undefined, true);
            }
          }
          finalizeDone(event.data);
        } else if (event.type === "error") {
          if (currentTurnIdRef.current !== assistantMessageId) return;
          if (textEndFinalizeTimeout) clearTimeout(textEndFinalizeTimeout);
          clearWatchdog();
          isLocalSendingRef.current = false;
          setStreamingState(false);
          setLiveStatus(null);
          try {
            abortCtrl.abort();
          } catch {}
          const errorMsg = event.data?.message || "An error occurred.";
          toast.error(errorMsg);
          setOptimisticMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: `⚠️ **Error:** ${errorMsg}` }
                : m
            )
          );
          queryClient.invalidateQueries({ queryKey: ["chat-messages", chatIdToUse] }).then(() => {
            setOptimisticMessages([]);
          });
          processNext();
        }
      }, abortCtrl.signal, activeFolder);

      await sendPrompt(chatIdToUse, userText, {
        files: filesToSend,
        variant: reasoningEffort || "medium",
        signal: abortCtrl.signal,
      });
      // Prompt was accepted by the engine. Streaming is now in progress over SSE.
      // Finalization is handled by the SSE listener (done / error events) or watchdog.
    } catch (err: any) {
      if (rafUpdateId !== null) {
        cancelAnimationFrame(rafUpdateId);
        rafUpdateId = null;
      }
      if (currentTurnIdRef.current !== assistantMessageId) return;
      clearWatchdog();
      console.error("[useWorkstationChat] sendPrompt error:", err);
      toast.error(`Error sending message: ${err?.message || err}`);
      isLocalSendingRef.current = false;
      setStreamingState(false);
      setLiveStatus(null);
      setOptimisticMessages([]);
      try {
        abortCtrl.abort();
      } catch {}
      processNext();
    }
  };

  return {
    chatMessages,
    optimisticMessages,
    liveStatus,
    isStreaming,
    reasoningEffort,
    setReasoningEffort,
    queuedPrompts,
    messagesEndRef,
    pendingQuestion,
    handleSendMessage,
    handleAnswerQuestion,
    handleCancelStream,
    handleNewChat,
    handleRemoveQueuedPrompt,
  };
}
