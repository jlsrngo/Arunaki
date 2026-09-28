import { useState, useEffect, useMemo } from "react";
import { cn } from "../../lib/utils";
import { ArunakiLogo } from "../common/ArunakiLogo";
import {
  Monitor,
  FileSpreadsheet,
  FileText,
  Keyboard,
  Cpu,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Database,
  FileSearch,
  Loader2,
} from "lucide-react";

export interface LiveStatusData {
  type?: 'thinking' | 'tool_preparing' | 'tool_start' | 'tool_progress' | 'tool_live_status' | 'tool_done' | 'text_delta';
  toolName?: string;
  preview?: string;
  screenshot?: string;
  timestamp?: string;
}

export interface StepItem {
  id: string;
  label: string;
  status: 'completed' | 'running' | 'failed' | 'error' | 'blocked';
  iconType: 'thinking' | 'tool' | 'text';
  toolName?: string;
}

/**
 * Clean, transparent action step label formatter.
 * Produces user-friendly Antigravity-style labels instead of raw tool internals.
 */
export function formatToolStepLabel(
  toolName: string,
  argsOrTarget?: any,
  isFinished = false
): string {
  const t = (toolName || "").toLowerCase();

  let target = "";
  if (typeof argsOrTarget === "string") {
    const trimmed = argsOrTarget.trim();
    if (!/^(completed|failed|executing|running|preparing)\b/i.test(trimmed)) {
      target = trimmed;
    }
  } else if (argsOrTarget && typeof argsOrTarget === "object") {
    target =
      argsOrTarget.TargetFile ||
      argsOrTarget.targetFile ||
      argsOrTarget.path ||
      argsOrTarget.filePath ||
      argsOrTarget.file ||
      argsOrTarget.pattern ||
      argsOrTarget.CommandLine ||
      argsOrTarget.commandLine ||
      (typeof argsOrTarget.command === "string" ? argsOrTarget.command : "") ||
      "";
  }

  // Clean filename if it's a path, suppressing internal dotfiles and ARUNAKI.md
  const rawFileName = target ? target.replace(/\\/g, "/").split("/").filter(Boolean).pop() || target : "";
  const isInternalOrHidden =
    rawFileName.startsWith(".") ||
    rawFileName.toLowerCase() === "arunaki.md" ||
    target.includes(".arunaki") ||
    target.includes(".git");
  const fileName = isInternalOrHidden ? "" : rawFileName;

  // 1. Read / View / Explore
  if (t === "read" || t === "read_file" || t === "view_file") {
    if (fileName) return isFinished ? `Explored ${fileName}` : `Reading ${fileName}`;
    return isFinished ? `Explored workspace` : `Exploring workspace`;
  }
  if (t === "list_dir" || t === "glob") {
    if (fileName) return isFinished ? `Explored folder ${fileName}` : `Exploring folder ${fileName}`;
    return isFinished ? `Explored workspace` : `Exploring workspace`;
  }

  // 2. Edit / Write / Replace
  if (t === "replace_file_content" || t === "multi_replace_file_content" || t === "edit" || t === "edit_file") {
    return isFinished ? `Edited ${fileName || "file"}` : `Editing ${fileName || "file"}`;
  }
  if (t === "write_to_file" || t === "write" || t === "create_file") {
    return isFinished ? `Created ${fileName || "file"}` : `Writing ${fileName || "file"}`;
  }

  // 3. Excel tools
  if (t.includes("excel")) {
    if (t.includes("read") || t.includes("view")) {
      return isFinished ? `Read Excel ${fileName || ""}`.trim() : `Reading Excel ${fileName || ""}`.trim();
    }
    if (t.includes("create") || t.includes("new")) {
      return isFinished ? `Created Excel ${fileName || ""}`.trim() : `Creating Excel ${fileName || ""}`.trim();
    }
    return isFinished ? `Updated Excel ${fileName || ""}`.trim() : `Updating Excel ${fileName || ""}`.trim();
  }

  // 4. Command / Bash / Script
  if (t === "run_command" || t === "bash" || t === "powershell") {
    const cmdPreview = target ? target.slice(0, 30) : "";
    return isFinished ? `Ran ${cmdPreview || "command"}` : `Running ${cmdPreview || "command"}`;
  }

  // 5. Search / Knowledge
  if (t.includes("knowledge") || t.includes("search") || t.includes("memory") || t.includes("grep")) {
    return isFinished ? `Searched workspace` : `Searching workspace`;
  }

  // Fallback
  const displayTool = toolName || "action";
  if (fileName) {
    return isFinished ? `${displayTool}: ${fileName}` : `Running ${displayTool}: ${fileName}`;
  }
  return isFinished ? `Executed ${displayTool}` : `Executing ${displayTool}`;
}

/**
 * Returns dynamic contextual action verb for active live indicator.
 * Active verbs instead of generic passive text.
 */
export function getActiveActionText(
  steps?: StepItem[],
  status?: LiveStatusData | null,
  isReasoning?: boolean,
  hasVisibleContent?: boolean
): string {
  // 1. If there is an active running tool
  const runningStep = steps?.find((s) => s.status === "running");
  if (runningStep) {
    const t = (runningStep.toolName || runningStep.label || "").toLowerCase();
    const l = runningStep.label;
    if (l && !l.startsWith("Executing:") && !l.startsWith("Preparing")) {
      return l.replace(/\.\.\.$/, "");
    }
    if (t.includes("excel")) return "Updating Excel document";
    if (t.includes("read") || t.includes("view")) return "Reading document";
    if (t.includes("write") || t.includes("edit")) return "Writing document";
    if (t.includes("search") || t.includes("grep")) return "Searching workspace";
    return runningStep.toolName ? `Running ${runningStep.toolName}` : "Executing action";
  }

  // 2. If status preview provides active tool action
  if (status?.preview && status.type && status.type !== "text_delta" && status.type !== "thinking") {
    return status.preview.replace(/\.\.\.$/, "");
  }

  // 3. If tools have finished and now preparing / synthesizing response
  const hasCompletedTools = steps && steps.some((s) => s.iconType === "tool");
  if (hasCompletedTools && !hasVisibleContent) {
    return "Synthesizing document data";
  }

  // 4. If active reasoning / thinking
  if (isReasoning) {
    return "Thinking";
  }

  // 5. If response is already streaming text
  if (hasVisibleContent) {
    return "Generating response";
  }

  return "Analyzing request";
}

/**
 * Dynamic active indicator with cycling animated dots (. -> .. -> ...).
 * Ensures the UI is alive, transparent, and never passive.
 */
export function LiveActionIndicator({
  action,
  elapsedSec,
  className,
}: {
  action?: string;
  elapsedSec?: number;
  className?: string;
}) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  const dots = ".".repeat(dotCount);
  const displayAction = action || "Thinking";

  return (
    <div className={cn("flex items-center gap-1.5 font-mono text-xs select-none py-1 animate-fade-in text-[var(--text-muted)]", className)}>
      <ArunakiLogo size={12} className="animate-pulse text-[#e59344] shrink-0" />
      <span className="text-[var(--text-primary)] font-medium">
        {displayAction}
        <span className="inline-block w-4 text-left font-mono text-[#e59344]">{dots}</span>
      </span>
      {typeof elapsedSec === "number" && elapsedSec > 0 && (
        <span className="text-[10px] text-[var(--text-dim)] font-mono">({elapsedSec}s)</span>
      )}
    </div>
  );
}

function renderStepIcon(step: StepItem) {
  if (step.iconType === "thinking") {
    return <ArunakiLogo size={12} className="animate-pulse text-[#e59344] shrink-0 mt-0.5" />;
  }
  if (step.iconType === "text") {
    return <Cpu size={12} className="text-[var(--text-muted)] shrink-0 mt-0.5" />;
  }
  const t = (step.toolName || step.label || "").toLowerCase();
  if (t.includes("excel") || t.includes("csv") || t.includes("xlsx") || t.includes("xls")) {
    return <FileSpreadsheet size={12} className="text-emerald-400 shrink-0 mt-0.5" />;
  }
  if (t.includes("word") || t.includes("docx") || t.includes("doc")) {
    return <FileText size={12} className="text-blue-400 shrink-0 mt-0.5" />;
  }
  if (t.includes("knowledge") || t.includes("memory")) {
    return <Database size={12} className="text-purple-400 shrink-0 mt-0.5" />;
  }
  if (t.includes("read") || t.includes("explore") || t.includes("file") || t.includes("search")) {
    return <FileSearch size={12} className="text-amber-400 shrink-0 mt-0.5" />;
  }
  if (t.includes("edit") || t.includes("write") || t.includes("replace")) {
    return <Keyboard size={12} className="text-cyan-400 shrink-0 mt-0.5" />;
  }
  return <Monitor size={12} className="text-[var(--text-muted)] shrink-0 mt-0.5" />;
}

interface LiveExecutionBadgeProps {
  status: LiveStatusData | null;
  active?: boolean;
}

export function LiveExecutionBadge({ status, active = true }: LiveExecutionBadgeProps) {
  if (!status || !active) return null;

  const hasToolExecution =
    status.type === "tool_preparing" ||
    status.type === "tool_start" ||
    status.type === "tool_live_status" ||
    status.type === "tool_progress";

  if (!hasToolExecution) return null;

  return null;
}

/**
 * Unified Agentic Thought & Execution Card.
 * Matches Antigravity / Cursor / Opencode standards:
 * 1. Compact document tasks checklist with running spinner & completed checkmarks
 * 2. Monospace collapsible thought stream with duration
 * 3. Transparent and active
 */
export function MessageThoughtBadge({
  steps = [],
  thoughtSec,
  thoughtMs,
  reasoning,
  showThinking = true,
  isStreaming = false,
}: {
  steps?: StepItem[];
  thoughtSec?: number;
  thoughtMs?: number;
  reasoning?: string;
  showThinking?: boolean;
  isStreaming?: boolean;
}) {
  const [toolCardExpanded, setToolCardExpanded] = useState<boolean | null>(null);
  const [thoughtExpanded, setThoughtExpanded] = useState<boolean | null>(null);
  const [liveSec, setLiveSec] = useState(0);

  useEffect(() => {
    if (!isStreaming) return;
    setLiveSec(0);
    const start = Date.now();
    const interval = setInterval(() => {
      setLiveSec(Math.max(1, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const toolSteps = steps.filter((s) => s.iconType === "tool" || s.toolName);
  const hasToolExecution = toolSteps.length > 0;
  const hasRunningTool = toolSteps.some((s) => s.status === "running");
  const completedToolCount = toolSteps.filter((s) => s.status === "completed").length;
  const failedToolCount = toolSteps.filter((s) => s.status === "failed" || s.status === "error" || s.status === "blocked").length;

  const displayReasoning = useMemo(() => {
    if (reasoning && reasoning.trim().length > 0) return reasoning.trim();
    return "";
  }, [reasoning]);

  const hasReasoning = Boolean(displayReasoning && displayReasoning.length > 0);

  const durationLabel = useMemo(() => {
    if (thoughtSec && thoughtSec > 0) {
      return `${thoughtSec.toFixed(1).replace(/\.0$/, "")}s`;
    }
    if (thoughtMs && thoughtMs > 0) {
      const sec = (thoughtMs / 1000).toFixed(1).replace(/\.0$/, "");
      return `${sec === "0" ? "0.1" : sec}s`;
    }
    if (isStreaming && liveSec > 0) {
      return `${liveSec}s`;
    }
    return undefined;
  }, [thoughtMs, thoughtSec, isStreaming, liveSec]);

  if (!hasToolExecution && (!showThinking || (!hasReasoning && !(isStreaming && hasReasoning)))) {
    return null;
  }

  // Antigravity / Cursor parity:
  // Tool card is expanded while actively running; snaps collapsed when finished.
  // Thought is expanded while actively streaming; snaps collapsed when finished.
  // Clicking manually overrides the default state.
  const isToolCardOpen = toolCardExpanded !== null ? toolCardExpanded : hasRunningTool;
  const isThoughtOpen = showThinking && (thoughtExpanded !== null ? thoughtExpanded : isStreaming);

  return (
    <div className="w-full min-w-0 mb-1 font-sans select-none animate-in fade-in duration-150">
      {/* 1. Live / Completed Function Calling Card */}
      {hasToolExecution && (
        <div className="mb-2 max-w-full w-full min-w-0 font-mono text-[11px] rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] overflow-hidden select-none shadow-xs">
          <button
            type="button"
            onClick={() => setToolCardExpanded(!isToolCardOpen)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[var(--bg-panel-sub)] hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-color)] cursor-pointer text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              {hasRunningTool ? (
                <Loader2 size={12} className="animate-spin text-amber-400 shrink-0" />
              ) : failedToolCount > 0 && completedToolCount === 0 ? (
                <X size={12} className="text-rose-400 shrink-0" />
              ) : (
                <Check size={12} className="text-emerald-400 shrink-0" />
              )}
              <span className="font-semibold text-white truncate">
                {hasRunningTool
                  ? `Executing ${toolSteps.length} document task${toolSteps.length > 1 ? "s" : ""}...`
                  : failedToolCount > 0 && completedToolCount === 0
                  ? `Blocked ${failedToolCount} script task${failedToolCount > 1 ? "s" : ""}`
                  : `Executed ${completedToolCount}/${toolSteps.length} document task${toolSteps.length > 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                {completedToolCount}/{toolSteps.length}
              </span>
              <span className="text-[var(--text-muted)] hover:text-white transition-colors">
                {isToolCardOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
            </div>
          </button>

          {isToolCardOpen && (
            <div className="p-2 space-y-1.5 bg-[var(--bg-panel)]">
              {toolSteps.map((step, idx) => {
                const isRunning = step.status === "running";
                const isFailed = step.status === "failed" || step.status === "error" || step.status === "blocked";
                return (
                  <div
                    key={step.id || `step-${idx}`}
                    className="flex items-center gap-2 text-[11px] py-0.5 px-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {isRunning ? (
                      <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />
                    ) : isFailed ? (
                      <X size={11} className="text-rose-400 shrink-0" />
                    ) : (
                      <Check size={11} className="text-emerald-400 shrink-0" />
                    )}
                    {renderStepIcon(step)}
                    <span className={cn("truncate max-w-[80%]", isFailed ? "text-rose-300/80 line-through" : isRunning ? "text-white font-medium" : "text-[var(--text-muted)]")}>
                      {step.label}
                    </span>
                    <span className={cn("text-[10px] ml-auto font-mono shrink-0", isRunning ? "text-amber-400 animate-pulse" : isFailed ? "text-rose-400 font-medium" : "text-[var(--text-dim)]")}>
                      {isRunning ? "running..." : isFailed ? "blocked" : "done"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Opencode / Antigravity Parity: Thought Block only rendered if LLM generated genuine reasoning */}
      {showThinking && hasReasoning && (
        <div className="w-full min-w-0 text-[11px] font-mono leading-relaxed select-text py-0.5 mb-1 whitespace-pre-wrap">
          <button
            type="button"
            onClick={() => setThoughtExpanded(!isThoughtOpen)}
            className="flex items-center gap-1.5 mb-1.5 not-italic font-mono text-[11px] select-none cursor-pointer hover:opacity-80 transition-opacity"
          >
            <ArunakiLogo size={12} className={cn("shrink-0", isStreaming ? "animate-pulse text-[#e59344]" : "text-[#e59344]/80")} />
            <span className="font-medium text-[#e59344]">Thought:</span>
            {durationLabel ? (
              <span className="text-[#e59344]/90 font-mono text-[11px]">{durationLabel}</span>
            ) : null}
            <span className="text-[#e59344]/50 flex items-center ml-0.5">
              {isThoughtOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </span>
          </button>

          {isThoughtOpen && (
            <div className="text-[11.5px] font-mono text-[var(--text-muted)] leading-relaxed select-text break-words not-italic opacity-90 pl-0.5">
              {displayReasoning}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3 bg-[#e59344] ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
