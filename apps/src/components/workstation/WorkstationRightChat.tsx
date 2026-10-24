import { RefObject, useState, useMemo, useCallback, useEffect, memo } from "react";
import { ArunakiLogo } from "../common/ArunakiLogo";
import {
  Bot,
  ChevronUp,
  PanelRightOpen,
} from "lucide-react";
import { LiveExecutionBadge, LiveStatusData } from "./LiveExecutionBadge";
import { LiveMirrorCard } from "./LiveMirrorCard";
import { LiveDocumentPreview } from "./LiveDocumentPreview";
import { Message } from "./chat/types";
import { ChatMessageBubble } from "./chat/ChatMessageBubble";
import { ChatInputBox } from "./chat/ChatInputBox";
import { ChatQueuedPrompts } from "./chat/ChatQueuedPrompts";
import { ChatImageLightbox } from "./chat/ChatImageLightbox";
import { WorkstationRightChatHeader } from "./chat/WorkstationRightChatHeader";

const INITIAL_VISIBLE_CHAT_MESSAGES = 20;
const LOAD_OLDER_STEP = 20;

interface Workspace {
  id: string;
  name: string;
  rootPath: string | null;
  status: string;
}

export interface WorkstationRightChatProps {
  collapsed: boolean;
  onClose: () => void;
  chatMessages: Message[];
  optimisticMessages: Message[];
  liveStatus: LiveStatusData | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  activeWorkspace: Workspace | null;
  isStreaming: boolean;
  onSendMessage: (
    prompt?: string,
    files?: Array<{ name: string; uri: string; mime?: string }>
  ) => void;
  width?: string | number;
  files?: Array<{ name: string }>;
  queuedPrompts?: string[];
  onRemoveQueuedPrompt?: (index: number) => void;
  onSearchSection?: () => void;
  reasoningEffort?: string;
  setReasoningEffort?: (effort: string) => void;
  effortOptions?: string[];
  activeModel?: { providerID: string; id: string };
  modelOptions?: Array<{ id: string; name: string }>;
  onSelectModel?: (model: { id: string; name: string }) => void;
  onNewChat?: () => void;
  onCancelStream?: () => void;
  onAnswerQuestion?: (requestId: string, selectedAnswer: string) => void;
  onCompactSession?: () => void;
  isCompacting?: boolean;
  isCompacted?: boolean;
  activeChatId?: string;
}

export const WorkstationRightChat = memo(function WorkstationRightChat({
  collapsed,
  onClose,
  chatMessages,
  optimisticMessages,
  liveStatus,
  messagesEndRef,
  isStreaming,
  onSendMessage,
  width = 320,
  files = [],
  queuedPrompts = [],
  onRemoveQueuedPrompt,
  onSearchSection,
  reasoningEffort = "",
  setReasoningEffort,
  effortOptions = [] as string[],
  activeModel,
  modelOptions = [] as Array<{ id: string; name: string }>,
  onSelectModel,
  onNewChat,
  onCancelStream,
  onAnswerQuestion,
  onCompactSession,
  isCompacting,
  isCompacted,
  activeChatId,
}: WorkstationRightChatProps) {
  // CRITICAL: React Rules of Hooks - all hooks declared unconditionally at top
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState<number>(INITIAL_VISIBLE_CHAT_MESSAGES);
  const [showThinking, setShowThinking] = useState<boolean>(() => {
    const saved = localStorage.getItem("arunaki_show_thinking");
    if (saved !== null) return saved === "true";
    return true;
  });

  // Reset visible window to 20 whenever user switches chat sessions
  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_CHAT_MESSAGES);
  }, [activeChatId]);

  const handlePreviewImage = useCallback((url: string) => {
    setLightboxUrl(url);
  }, []);

  const handleResend = useCallback(
    (content: string) => {
      onSendMessage(content);
    },
    [onSendMessage]
  );

  const allMessages = useMemo(() => {
    if (!optimisticMessages || optimisticMessages.length === 0) {
      return chatMessages;
    }
    const result: Message[] = [...chatMessages];
    const seenIds = new Set(chatMessages.map((m) => m.id));

    const lastPersistedUser = [...chatMessages].reverse().find((m) => m.role === "user");
    const lastPersistedAsst = [...chatMessages].reverse().find((m) => m.role === "assistant");

    for (const opt of optimisticMessages) {
      if (seenIds.has(opt.id)) continue;
      const optText = (opt.content || "").trim();
      const optReasoning = (opt.reasoning || "").trim();

      // 1. User message: deduplicate only if the latest persisted user message matches exact content
      if (opt.role === "user") {
        const lastUserText = (lastPersistedUser?.content || "").trim();
        if (optText.length > 0 && lastUserText === optText) continue;
        result.push(opt);
        continue;
      }

      // 2. Assistant message: while actively streaming, ALWAYS keep the active assistant bubble so thinking and tokens stream live!
      if (isStreaming) {
        result.push(opt);
        continue;
      }

      // 3. When streaming has finished, deduplicate if the latest persisted assistant message has matching content or reasoning
      const lastAsstText = (lastPersistedAsst?.content || "").trim();
      const lastAsstReasoning = (lastPersistedAsst?.reasoning || "").trim();
      if (lastAsstText.length > 0) {
        if (optText.length > 0 && lastAsstText === optText) continue;
        if (optReasoning.length > 0 && lastAsstReasoning.length > 0 && lastAsstReasoning === optReasoning) continue;
      }

      result.push(opt);
    }
    return result;
  }, [chatMessages, optimisticMessages, isStreaming]);

  const hiddenCount = Math.max(0, allMessages.length - visibleLimit);
  const visibleMessages = useMemo(() => {
    if (allMessages.length <= visibleLimit) return allMessages;
    return allMessages.slice(allMessages.length - visibleLimit);
  }, [allMessages, visibleLimit]);

  const handleScrollContainer = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (hiddenCount <= 0) return;
      const el = e.currentTarget;
      if (el.scrollTop <= 48) {
        setVisibleLimit((prev) => prev + LOAD_OLDER_STEP);
      }
    },
    [hiddenCount]
  );

  if (collapsed) {
    return (
      <aside className="w-10 bg-[var(--bg-panel)] border-l border-[var(--border-color)] flex flex-col items-center py-2 shrink-0 select-none transition-colors duration-150">
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          title="Open Chat Panel"
        >
          <PanelRightOpen className="w-4 h-4 text-[var(--text-primary)]" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-4 text-[var(--text-muted)]">
          <Bot className="w-4 h-4 opacity-40" />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="relative bg-[var(--bg-panel)] border-l border-[var(--border-color)] flex flex-col h-full shrink-0 select-text overflow-hidden transition-colors duration-150"
      style={{ width: width || 320 }}
    >
      {/* Panel Header */}
      <WorkstationRightChatHeader
        activeChatId={activeChatId}
        onNewChat={onNewChat}
        onCompactSession={onCompactSession}
        isCompacting={isCompacting}
        isCompacted={isCompacted}
        onClose={onClose}
      />

      {/* Messages List Area */}
      <div
        onScroll={handleScrollContainer}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4 font-sans text-xs min-w-0"
      >
        {allMessages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 select-none">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-card)] flex items-center justify-center mb-3 border border-[var(--border-color)]">
              <ArunakiLogo size={20} className="text-[var(--text-muted)]" />
            </div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-1">Workspace Agent</p>
            <p className="text-[11px] text-[var(--text-muted)] max-w-[200px]">
              Ask anything or provide document instructions.
            </p>
          </div>
        ) : (
          <>
            {hiddenCount > 0 && (
              <div className="flex justify-center pt-1 pb-2">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + LOAD_OLDER_STEP)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] transition-colors cursor-pointer"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>
                    Show {Math.min(LOAD_OLDER_STEP, hiddenCount)} older messages ({hiddenCount} hidden)
                  </span>
                </button>
              </div>
            )}
            {visibleMessages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const isMsgStreaming = isStreaming && !isUser && idx === visibleMessages.length - 1;

              return (
                <ChatMessageBubble
                  key={msg.id || idx}
                  msg={msg}
                  isUser={isUser}
                  isStreaming={isMsgStreaming}
                  showThinking={showThinking}
                  onPreviewImage={handlePreviewImage}
                  onResend={handleResend}
                  onAnswerQuestion={onAnswerQuestion}
                />
              );
            })}
          </>
        )}

        {/* Live Execution Telemetry Badge & Mirror Card */}
        {isStreaming && (
          <div className="mr-auto items-start max-w-[92%] space-y-2">
            <LiveExecutionBadge status={liveStatus} />
            <LiveDocumentPreview status={liveStatus} />
            <LiveMirrorCard
              screenshotUrl={liveStatus?.screenshot || ""}
              timestamp={liveStatus?.timestamp}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Prompt Box & Queued Messages Card Area */}
      <div className="p-3 bg-[var(--bg-panel)] border-t border-[var(--border-color)] shrink-0 select-none transition-colors duration-150">
        <ChatQueuedPrompts
          queuedPrompts={queuedPrompts}
          onRemoveQueuedPrompt={onRemoveQueuedPrompt}
        />

        <ChatInputBox
          files={files}
          isStreaming={isStreaming}
          onSendMessage={onSendMessage}
          onCancelStream={onCancelStream}
          onSearchSection={onSearchSection}
          onNewChat={onNewChat}
          reasoningEffort={reasoningEffort}
          setReasoningEffort={setReasoningEffort}
          effortOptions={effortOptions}
          activeModel={activeModel}
          modelOptions={modelOptions}
          onSelectModel={onSelectModel}
          showThinking={showThinking}
          setShowThinking={setShowThinking}
          onPreviewImage={handlePreviewImage}
          onCompactSession={onCompactSession}
        />
      </div>

      {/* Scoped Chat-Only Image Preview Modal */}
      <ChatImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </aside>
  );
});
