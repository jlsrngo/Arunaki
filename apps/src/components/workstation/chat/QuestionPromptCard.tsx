import React, { useState, memo } from "react";
import { Check, ArrowRight, Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { QuestionData, QuestionInfo, QuestionOption } from "./types";

function formatHeader(header?: string): string {
  if (!header) return "";
  const trimmed = header.trim();
  if (trimmed.length > 2 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .split(" ")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return trimmed;
}

interface QuestionPromptCardProps {
  questionData: QuestionData;
  onAnswer: (requestId: string, selectedAnswer: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export const QuestionPromptCard = memo(function QuestionPromptCard({
  questionData,
  onAnswer,
  disabled = false,
  isStreaming = false,
}: QuestionPromptCardProps) {
  const [selected, setSelected] = useState<string | null>(
    typeof questionData.selectedAnswer === "string" ? questionData.selectedAnswer : null
  );
  const [customText, setCustomText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAnswered = Boolean(questionData.answered || selected);

  const handleSelect = (label: string) => {
    if (disabled || isAnswered || isSubmitting) return;
    setIsSubmitting(true);
    setSelected(label);
    try {
      onAnswer(questionData.id, label);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customText.trim();
    if (!trimmed || disabled || isAnswered || isSubmitting) return;
    handleSelect(trimmed);
  };

  const firstQuestion: QuestionInfo | undefined = questionData.questions?.[0];
  if (!firstQuestion) return null;

  if (isAnswered) {
    const rawAnswer = selected || questionData.selectedAnswer;
    const displayAnswer = Array.isArray(rawAnswer)
      ? rawAnswer.join(", ")
      : rawAnswer != null
      ? String(rawAnswer)
      : "";

    return (
      <div
        className="my-2.5 w-full max-w-xl min-w-0 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-xs text-left"
        data-testid="question-prompt-card-answered"
      >
        <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg-panel-sub)] border-b border-[var(--border-color)] text-[11px] select-none">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shrink-0 select-none shadow-xs">
              <Check className="h-2.5 w-2.5 text-black stroke-[3.5]" />
            </span>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {formatHeader(firstQuestion.header) || "Clarification Resolved"}
            </span>
          </div>
          {isStreaming ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--text-primary)] font-mono">
              <Loader2 className="h-3 w-3 animate-spin text-[var(--text-secondary)]" />
              Processing...
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-dim)] font-mono">Answered</span>
          )}
        </div>
        <div className="px-3.5 py-2.5 bg-[var(--bg-panel)] flex flex-col gap-2 min-w-0">
          {firstQuestion.question && (
            <p className="text-xs text-[var(--text-muted)] leading-relaxed break-words [overflow-wrap:anywhere]">
              {firstQuestion.question}
            </p>
          )}
          {displayAnswer && (
            <div className="flex items-start min-w-0">
              <div className="inline-block max-w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-sub)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] break-words whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">
                {displayAnswer}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="my-2.5 w-full max-w-xl min-w-0 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-xs text-left transition-all duration-200"
      data-testid="question-prompt-card"
    >
      {/* Table Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg-panel-sub)] border-b border-[var(--border-color)] text-[11px] select-none">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shrink-0 select-none shadow-xs">
            <svg
              className="h-2.5 w-2.5 text-black"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {formatHeader(firstQuestion.header) || "Clarification Needed"}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-dim)]">
          {firstQuestion.options?.length ? `${firstQuestion.options.length} options` : ""}
        </span>
      </div>

      {/* Question Prompt */}
      <div className="px-3.5 py-2.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
        <p className="text-xs sm:text-[13px] font-medium text-[var(--text-primary)] leading-relaxed break-words [overflow-wrap:anywhere]">
          {firstQuestion.question}
        </p>
      </div>

      {/* Option Rows (Table Style, separated by hairline border) */}
      <div className="divide-y divide-[var(--border-color)]">
        {firstQuestion.options?.map((opt: QuestionOption, idx: number) => {
          const isRecommended =
            idx === 0 ||
            opt.label.toLowerCase().includes("recommended") ||
            opt.label.toLowerCase().includes("rekomendasi");

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled || isSubmitting}
              onClick={() => handleSelect(opt.label)}
              className={cn(
                "group w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer",
                "bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]",
                isSubmitting && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs sm:text-[13px] font-medium text-[var(--text-primary)] break-words">
                  {opt.label}
                </div>
                {opt.description && (
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-normal line-clamp-2 break-words">
                    {opt.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-center">
                {isRecommended && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-sub)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--text-muted)] tracking-tight">
                    <Sparkles className="h-2.5 w-2.5 text-[var(--text-secondary)]" />
                    Recommended
                  </span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-[var(--text-dim)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Input Row (Table Footer) */}
      {firstQuestion.custom !== false && (
        <form
          onSubmit={handleCustomSubmit}
          className="px-3 py-2 bg-[var(--bg-panel-sub)] border-t border-[var(--border-color)] flex items-center gap-2 min-w-0"
        >
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Or type a custom response..."
            disabled={disabled || isSubmitting}
            className="flex-1 min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!customText.trim() || disabled || isSubmitting}
            className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 cursor-pointer shrink-0"
            title="Submit response"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      )}
    </div>
  );
});
