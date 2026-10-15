import { memo, type RefObject } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { useI18n } from "../../../../lib/i18n";
import { effortEffortLabel } from "./types";

interface ChatReasoningEffortDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  dropdownRef: RefObject<HTMLDivElement | null>;
  reasoningEffort: string;
  effortOptions: string[];
  setReasoningEffort?: (val: string) => void;
}

export const ChatReasoningEffortDropdown = memo(function ChatReasoningEffortDropdown({
  isOpen,
  onToggle,
  dropdownRef,
  reasoningEffort,
  effortOptions,
  setReasoningEffort,
}: ChatReasoningEffortDropdownProps) {
  const { t } = useI18n();

  if (!setReasoningEffort || effortOptions.length === 0) {
    return null;
  }

  const currentEffortLabel = effortOptions.includes(reasoningEffort)
    ? effortEffortLabel(reasoningEffort)
    : effortEffortLabel(effortOptions[0] ?? reasoningEffort);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={onToggle}
        className="text-[10px] bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-[var(--text-primary)] px-2 py-0.5 rounded-full font-medium border border-[var(--border-color)] hover:border-[var(--border-strong)] flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
        title={t("reasoningEffort", "Reasoning Effort")}
      >
        <span>{currentEffortLabel}</span>
        <ChevronDown
          className={cn(
            "w-2.5 h-2.5 text-[var(--text-muted)] transition-transform duration-150",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-1.5 left-0 w-28 rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl p-1 space-y-0.5 z-50 animate-in fade-in duration-100">
          <div className="px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] border-b border-[var(--border-color)] mb-0.5">
            {t("reasoningEffort", "Reasoning Effort")}
          </div>
          {effortOptions.map((opt) => {
            const isSelected = reasoningEffort === opt;
            const optLabel = effortEffortLabel(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setReasoningEffort(opt);
                  try {
                    localStorage.setItem("arunaki_reasoning_effort", opt);
                  } catch {}
                  onToggle();
                }}
                className={cn(
                  "w-full text-left px-2 py-1 rounded-lg text-[10px] flex items-center justify-between cursor-pointer transition-colors",
                  isSelected
                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                )}
              >
                <span>{optLabel}</span>
                {isSelected && (
                  <Check className="w-2.5 h-2.5 text-[var(--text-primary)] shrink-0 stroke-[2.5]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
