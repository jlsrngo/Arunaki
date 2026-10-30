import { memo } from "react";
import { SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { describeModel } from "../modelDescribe";
import type { CliProviderId } from "../types";

interface CliModelDropdownProps {
  targetKey: CliProviderId;
  presetModels: string[];
  activeId: string;
  isActive: boolean;
  friendlyName: string;
  isLive?: boolean;
  isEn: boolean;
  selectedModel?: string;
  isOpen: boolean;
  customInputValue: string;
  onToggleDropdown: () => void;
  onSelectModel: (
    targetKey: string,
    modelName: string,
    activeId: string,
    isActive: boolean,
    friendlyName: string
  ) => void;
  onCustomInputChange: (val: string) => void;
}

export const CliModelDropdown = memo(function CliModelDropdown({
  targetKey,
  presetModels,
  activeId,
  isActive,
  friendlyName,
  isLive = false,
  isEn,
  selectedModel,
  isOpen,
  customInputValue,
  onToggleDropdown,
  onSelectModel,
  onCustomInputChange,
}: CliModelDropdownProps) {
  if (!presetModels.length) return null;
  const currentModel = selectedModel || presetModels[0];
  const meta = describeModel(currentModel);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleDropdown}
        className="px-2.5 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--border-strong)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 max-w-[140px] sm:max-w-[180px]"
        title="Choose model manually"
      >
        <SlidersHorizontal className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
        <span className="truncate font-mono">{meta.label}</span>
        <ChevronDown
          className={cn("w-3 h-3 text-[var(--text-muted)] shrink-0 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 p-2.5 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl space-y-2">
          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-[var(--border-color)]">
            <span className="text-xs font-semibold text-[var(--text-primary)]">Model</span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {isLive ? (isEn ? "Live from account" : "Live dari akun") : isEn ? "Default list" : "Daftar bawaan"}
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
            {presetModels.map((m) => {
              const itemMeta = describeModel(m);
              const isSelected = currentModel === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSelectModel(targetKey, m, activeId, isActive, friendlyName)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer",
                    isSelected
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium border border-[var(--border-strong)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{itemMeta.label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {itemMeta.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-panel)] text-[var(--text-secondary)] border border-[var(--border-color)] font-mono">
                        {itemMeta.badge}
                      </span>
                    )}
                    {itemMeta.speed && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-color)] font-mono">
                        {itemMeta.speed}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Model Input */}
          <div className="pt-2 border-t border-[var(--border-color)] space-y-1.5">
            <div className="text-[10px] text-[var(--text-muted)] font-medium px-1">Custom / Manual Model:</div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customInputValue}
                onChange={(e) => onCustomInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customInputValue.trim()) {
                    onSelectModel(targetKey, customInputValue.trim(), activeId, isActive, friendlyName);
                  }
                }}
                placeholder="Type model name..."
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] px-2.5 py-1 rounded-lg focus:outline-none focus:border-[var(--border-strong)] font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  if (customInputValue.trim()) {
                    onSelectModel(targetKey, customInputValue.trim(), activeId, isActive, friendlyName);
                  }
                }}
                className="px-2.5 py-1 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-app)] font-semibold text-xs rounded-lg transition-all cursor-pointer"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
