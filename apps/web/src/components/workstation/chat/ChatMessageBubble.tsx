import { memo, useState, useEffect, useMemo, type MouseEvent } from "react";
import { Check, Copy, RotateCcw, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { API_BASE } from "../../../lib/api";
import { getFileIcon } from "../../workspace/tree-utils";
import { MessageThoughtBadge, StepItem, LiveActionIndicator, getActiveActionText } from "../LiveExecutionBadge";
import { ChatMessageContent } from "./ChatMessageContent";
import { QuestionPromptCard } from "./QuestionPromptCard";
import { Message, QuestionData } from "./types";

interface ChatMessageBubbleProps {
  msg: Message;
  isUser: boolean;
  isStreaming?: boolean;
  showThinking?: boolean;
  onPreviewImage?: (url: string) => void;
  onResend?: (content: string) => void;
  onAnswerQuestion?: (requestId: string, selectedAnswer: string) => void;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  msg,
  isUser,
  isStreaming = false,
  showThinking = true,
  onPreviewImage,
  onResend,
  onAnswerQuestion,
}: ChatMessageBubbleProps) {
  // CRITICAL: React Rules of Hooks - all hooks unconditionally declared at the top before any condition or early return!
  const [copied, setCopied] = useState(false);
  const [liveElapsedSec, setLiveElapsedSec] = useState(0);

  useEffect(() => {
    if (!isStreaming) return;
    setLiveElapsedSec(0);
    const start = Date.now();
    const interval = setInterval(() => {
      setLiveElapsedSec(Math.max(1, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const imageMentions = useMemo(() => {
    const contentStr = msg?.content || "";
    const matches = contentStr.match(/(?:@)?([a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp|gif))\b/gi) || [];
    return Array.from(new Set(matches.map((m) => m.replace(/^@/, ""))));
  }, [msg?.content]);

  const attachedImages = useMemo(() => {
    const fromFiles: Array<{ name: string; url: string }> = [];
    if (msg?.files && Array.isArray(msg.files)) {
      for (const f of msg.files) {
        if (f && f.uri) {
          const isImg =
            f.uri.startsWith("data:image/") ||
            f.mime?.startsWith("image/") ||
            /\.(png|jpg|jpeg|webp|gif)$/i.test(f.name || "") ||
            /\.(png|jpg|jpeg|webp|gif)$/i.test(f.uri);
          if (isImg) {
            fromFiles.push({
              name: f.name || "Attached image",
              url: f.uri,
            });
          }
        }
      }
    }
    // Fallback to legacy parsed @filename mentions if no structured files
    if (fromFiles.length === 0 && imageMentions.length > 0) {
      for (const imgName of imageMentions) {
        fromFiles.push({
          name: imgName,
          url: `${API_BASE}/files/raw/${encodeURIComponent(imgName)}`,
        });
      }
    }
    return fromFiles;
  }, [msg?.files, imageMentions]);

  const attachedOtherFiles = useMemo(() => {
    if (!msg?.files || !Array.isArray(msg.files)) return [];
    return msg.files.filter((f) => {
      if (!f || !f.uri) return false;
      const isImg =
        f.uri.startsWith("data:image/") ||
        f.mime?.startsWith("image/") ||
        /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f.name || "") ||
        /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f.uri);
      return !isImg;
    });
  }, [msg?.files]);

  const displayContent = useMemo(() => {
    const raw = (msg?.content || "").replace(/<\/?think\??>/gi, "");
    if (imageMentions.length === 0) return isStreaming ? raw : raw.trim();
    return raw.replace(/(?:@)?([a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp|gif))\b/gi, "").trim();
  }, [msg?.content, imageMentions, isStreaming]);

  const timeString = useMemo(() => {
    if (!msg?.createdAt) return "";
    try {
      const date = new Date(msg.createdAt);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }, [msg?.createdAt]);

  let steps: StepItem[] | undefined = msg?.executionSteps;
  let thoughtSec = msg?.thoughtSec;
  let thoughtMs = msg?.thoughtMs;

  if (!steps && msg?.metadata) {
    try {
      const meta = typeof msg.metadata === "string" ? JSON.parse(msg.metadata) : msg.metadata;
      if (meta?.executionSteps) steps = meta.executionSteps;
      if (meta?.thoughtSec) thoughtSec = meta.thoughtSec;
      if (meta?.thoughtMs) thoughtMs = meta.thoughtMs;
    } catch {}
  }
  if (steps) {
    steps = steps.filter((s) => s.toolName?.toLowerCase() !== "question" && !s.label.toLowerCase().includes("question"));
    if (steps.length === 0) steps = undefined;
  }

  type PartGroup =
    | { type: "thought"; id: string; text: string; durationSec?: number; durationMs?: number; isLast: boolean }
    | { type: "tools"; id: string; steps: StepItem[]; isRunning: boolean; isLast: boolean }
    | { type: "text"; id: string; text: string; isLast: boolean }
    | { type: "question"; id: string; data: QuestionData; isLast: boolean };

  const partGroups = useMemo<PartGroup[]>(() => {
    if (!msg?.parts || msg.parts.length === 0) return [];

    const groups: PartGroup[] = [];

    for (let i = 0; i < msg.parts.length; i++) {
      const part = msg.parts[i];
      if (part.type === "thought") {
        const text = (part.text || "").trim();
        if (text || isStreaming) {
          groups.push({
            type: "thought",
            id: `thought-${i}`,
            text,
            durationSec: part.durationSec,
            durationMs: part.durationMs,
            isLast: false,
          });
        }
      } else if (part.type === "tool") {
        if (
          part.step.toolName?.toLowerCase() === "question" ||
          part.step.label.toLowerCase().includes("question")
        ) {
          continue;
        }
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.type === "tools") {
          if (!lastGroup.steps.some((s) => s.id === part.step.id)) {
            lastGroup.steps.push(part.step);
            if (part.step.status === "running") lastGroup.isRunning = true;
          }
        } else {
          groups.push({
            type: "tools",
            id: `tools-${i}`,
            steps: [part.step],
            isRunning: part.step.status === "running",
            isLast: false,
          });
        }
      } else if (part.type === "question") {
        groups.push({
          type: "question",
          id: `question-${i}`,
          data: part.data,
          isLast: false,
        });
      } else if (part.type === "text" && part.text && part.text.trim().length > 0) {
        const cleanT = part.text.replace(/<\/?think\??>/gi, "").trim();
        if (cleanT) {
          const lastGroup = groups[groups.length - 1];
          if (lastGroup && lastGroup.type === "text") {
            lastGroup.text += "\n\n" + cleanT;
          } else {
            groups.push({
              type: "text",
              id: `text-${i}`,
              text: cleanT,
              isLast: false,
            });
          }
        }
      }
    }

    // Merge streaming steps if not yet present in msg.parts
    if (steps && steps.length > 0) {
      const activeSteps = steps.filter(
        (s) => s.toolName?.toLowerCase() !== "question" && !s.label.toLowerCase().includes("question")
      );
      if (activeSteps.length > 0) {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.type === "tools") {
          for (const s of activeSteps) {
            if (!lastGroup.steps.some((existing) => existing.id === s.id)) {
              lastGroup.steps.push(s);
              if (s.status === "running") lastGroup.isRunning = true;
            }
          }
        } else if (!groups.some((g) => g.type === "tools")) {
          groups.push({
            type: "tools",
            id: "tools-streaming",
            steps: activeSteps,
            isRunning: activeSteps.some((s) => s.status === "running"),
            isLast: false,
          });
        }
      }
    }

    // Ensure fallback reasoning is included if no thoughts were extracted from parts
    if (!groups.some((g) => g.type === "thought") && (msg?.reasoning || (isStreaming && showThinking))) {
      const thoughtTxt = (msg?.reasoning || "").trim();
      if (thoughtTxt || isStreaming) {
        groups.unshift({
          type: "thought",
          id: "thought-initial",
          text: thoughtTxt,
          durationSec: thoughtSec || msg?.thoughtSec,
          durationMs: thoughtMs || msg?.thoughtMs,
          isLast: false,
        });
      }
    }

    // Ensure text bubble is present if displayContent exists but no text part was parsed
    const hasTextPart = groups.some((g) => g.type === "text");
    const fullText = (displayContent || "").replace(/<\/?think\??>/gi, "").trim();
    if (!hasTextPart && fullText) {
      groups.push({
        type: "text",
        id: "text-unified",
        text: fullText,
        isLast: false,
      });
    }

    if (groups.length > 0) {
      groups[groups.length - 1].isLast = true;
    }

    return groups;
  }, [
    msg?.parts,
    msg?.reasoning,
    msg?.thoughtSec,
    msg?.thoughtMs,
    isStreaming,
    showThinking,
    thoughtSec,
    thoughtMs,
    steps,
    displayContent,
  ]);

  const hasPartsContent = !isUser && Boolean(partGroups.length > 0);
  const hasVisibleContent =
    hasPartsContent ||
    displayContent.length > 0 ||
    attachedImages.length > 0 ||
    attachedOtherFiles.length > 0 ||
    Boolean(msg?.question);
  const isThinkingActive = !isUser && Boolean(isStreaming && !hasVisibleContent);

  const activeActionText = useMemo(() => {
    if (!isStreaming) return "";
    return getActiveActionText(steps, undefined, Boolean(isThinkingActive || (msg?.reasoning && !hasVisibleContent)), hasVisibleContent);
  }, [isStreaming, steps, isThinkingActive, msg?.reasoning, hasVisibleContent]);

  const hasThoughtOrSteps =
    !isUser &&
    (Boolean(showThinking && (msg?.reasoning || isThinkingActive || msg?.thoughtSec || thoughtSec || msg?.thoughtMs || thoughtMs)) ||
      Boolean(steps && steps.length > 0) ||
      hasPartsContent);

  if (!hasVisibleContent && !hasThoughtOrSteps) {
    return null;
  }

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(msg.content || "");
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResend = (e: MouseEvent) => {
    e.stopPropagation();
    if (onResend && msg.content) {
      onResend(msg.content);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1 w-full max-w-[96%] min-w-0",
        isUser ? "ml-auto items-end" : "mr-auto items-start"
      )}
    >
      {!isUser && partGroups.length > 0 ? (
        <div className="flex flex-col gap-1.5 w-full min-w-0">
          {partGroups.map((group) => {
            if (group.type === "thought") {
              if (!group.text && !isStreaming) return null;
              return (
                <MessageThoughtBadge
                  key={group.id}
                  thoughtSec={group.durationSec}
                  thoughtMs={group.durationMs}
                  reasoning={group.text}
                  showThinking={showThinking}
                  isStreaming={isStreaming && group.isLast}
                  liveElapsedSec={liveElapsedSec}
                />
              );
            }
            if (group.type === "tools") {
              return (
                <MessageThoughtBadge
                  key={group.id}
                  steps={group.steps}
                  showThinking={false}
                  isStreaming={isStreaming && group.isLast && group.isRunning}
                  liveElapsedSec={liveElapsedSec}
                />
              );
            }
            if (group.type === "text") {
              return (
                <div
                  key={group.id}
                  className={cn(
                    "p-3 rounded-2xl text-xs leading-relaxed w-full min-w-0 max-w-full break-words [word-break:break-word] [overflow-wrap:anywhere] overflow-hidden font-sans relative",
                    "bg-[var(--bg-card)] text-[var(--text-secondary)] rounded-bl-xs border border-[var(--border-color)]"
                  )}
                >
                  {attachedImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2.5">
                      {attachedImages.map((img, i) => (
                        <div
                          key={i}
                          className="group/img relative rounded-xl overflow-hidden border border-[var(--border-strong)] bg-black/25 shadow-xs cursor-pointer hover:border-[var(--border-primary)] transition-all p-1"
                          onClick={() => onPreviewImage?.(img.url)}
                          title="Click to view full image"
                        >
                          <img
                            src={img.url}
                            alt={img.name}
                            className="max-w-[240px] max-h-[170px] rounded-lg object-contain group-hover/img:scale-[1.02] transition-transform duration-150 block"
                            onError={(e) => {
                              const parent = (e.target as HTMLElement).parentElement;
                              if (parent) {
                                parent.innerHTML = `<div class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--text-primary)] bg-[var(--bg-panel)] rounded-lg"><span class="text-[11px] font-medium">📎 ${img.name}</span></div>`;
                              }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <ChatMessageContent content={group.text} isUser={false} />
                  {isStreaming && group.isLast && (
                    <span className="inline-block w-1.5 h-3.5 bg-[var(--text-primary)]/80 ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              );
            }
            if (group.type === "question") {
              return (
                <QuestionPromptCard
                  key={group.id}
                  questionData={group.data}
                  onAnswer={(reqId, ans) => onAnswerQuestion?.(reqId, ans)}
                  isStreaming={isStreaming}
                />
              );
            }
            return null;
          })}
        </div>
      ) : (
        <>
          {msg.question && (
            <QuestionPromptCard
              questionData={msg.question}
              onAnswer={(reqId, ans) => onAnswerQuestion?.(reqId, ans)}
              isStreaming={isStreaming}
            />
          )}
          {!isUser && ((msg.reasoning && msg.reasoning.trim().length > 0) || (steps && steps.length > 0)) && (
            <MessageThoughtBadge
              steps={steps}
              thoughtSec={thoughtSec}
              thoughtMs={thoughtMs}
              reasoning={msg.reasoning}
              showThinking={showThinking}
              isStreaming={isStreaming}
            />
          )}

          {hasVisibleContent ? (
            <div
              className={cn(
                "p-3 rounded-2xl text-xs leading-relaxed w-full min-w-0 max-w-full break-words [word-break:break-word] [overflow-wrap:anywhere] overflow-hidden font-sans relative",
                isUser
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-br-xs border border-[var(--border-strong)]"
                  : "bg-[var(--bg-card)] text-[var(--text-secondary)] rounded-bl-xs border border-[var(--border-color)]"
              )}
            >
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {attachedImages.map((img, i) => (
                    <div
                      key={i}
                      className="group/img relative rounded-xl overflow-hidden border border-[var(--border-strong)] bg-black/25 shadow-xs cursor-pointer hover:border-[var(--border-primary)] transition-all p-1"
                      onClick={() => onPreviewImage?.(img.url)}
                      title="Click to view full image"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="max-w-[240px] max-h-[170px] rounded-lg object-contain group-hover/img:scale-[1.02] transition-transform duration-150 block"
                        onError={(e) => {
                          const parent = (e.target as HTMLElement).parentElement;
                          if (parent) {
                            parent.innerHTML = `<div class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--text-primary)] bg-[var(--bg-panel)] rounded-lg"><span class="text-[11px] font-medium">📎 ${img.name}</span></div>`;
                          }
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-end p-2 pointer-events-none">
                        <span className="text-[10px] font-medium text-white bg-black/75 backdrop-blur-xs px-2 py-0.5 rounded-md truncate max-w-full opacity-0 group-hover/img:opacity-100 transition-opacity">
                          {img.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {attachedOtherFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {attachedOtherFiles.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-xs"
                    >
                      <div className="text-[var(--text-muted)] shrink-0">
                        {getFileIcon(file.name || "file.txt") || <FileText className="w-4 h-4" />}
                      </div>
                      <span className="text-[11px] font-medium text-[var(--text-primary)] truncate max-w-[200px]">
                        {file.name || "Attached file"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {displayContent ? (
                <div className="relative">
                  <ChatMessageContent content={displayContent} isUser={isUser} />
                  {isStreaming && !isUser && (
                    <span className="inline-block w-1.5 h-3.5 bg-[var(--text-primary)]/80 ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {/* Dynamic active indicator while streaming - active, transparent, never passive */}
      {!isUser && isStreaming && (
        <div className="py-0.5 px-1">
          <LiveActionIndicator
            action={activeActionText}
            elapsedSec={liveElapsedSec}
          />
        </div>
      )}

      {/* Action Toolbar & Timestamp - only rendered when there is visible bubble content */}
      {hasVisibleContent && (
        <div
          className={cn(
            "flex items-center gap-2 px-1 select-none text-[10px] text-[var(--text-muted)] mt-0.5",
            isUser ? "flex-row-reverse" : "flex-row"
          )}
        >
          <span className="opacity-70">{timeString}</span>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Copy message"
            >
              {copied ? <Check className="w-3 h-3 text-[var(--text-primary)]" /> : <Copy className="w-3 h-3" />}
            </button>

            {isUser && onResend && (
              <button
                type="button"
                onClick={handleResend}
                className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center gap-0.5"
                title="Resend prompt"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
