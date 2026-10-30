import { memo, type RefObject } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { useI18n } from "../../../../lib/i18n";
import { describeModel } from "../../../settings/SettingsCliConnectionsTab";

interface ChatModelPickerDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  dropdownRef: RefObject<HTMLDivElement | null>;
  activeModel?: { providerID: string; id: string };
  modelOptions: Array<{ id: string; name: string }>;
  onSelectModel?: (model: { id: string; name: string }) => void;
}

export const ChatModelPickerDropdown = memo(function ChatModelPickerDropdown({
  isOpen,
  onToggle,
  dropdownRef,
  activeModel,
  modelOptions,
  onSelectModel,
}: ChatModelPickerDropdownProps) {
  const { t } = useI18n();

  if (!onSelectModel || (modelOptions.length === 0 && !activeModel?.id)) {
    return null;
  }

  const activeDesc = describeModel(
    modelOptions.find((m) => m.id === activeModel?.id)?.id || activeModel?.id
  );
  const activeLabel = activeDesc.badge
    ? `${activeDesc.label} (${activeDesc.badge})`
    : activeDesc.label;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={onToggle}
        className="text-[10px] bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-[var(--text-primary)] px-2 py-0.5 rounded-full font-medium border border-[var(--border-color)] hover:border-[var(--border-strong)] flex items-center gap-1 cursor-pointer transition-colors max-w-[180px]"
        title={t("model", "Model")}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown
          className={cn(
            "w-2.5 h-2.5 text-[var(--text-muted)] transition-transform duration-150 shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-1.5 left-0 w-60 max-h-64 overflow-y-auto rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] p-1 space-y-0.5 z-50 animate-in fade-in duration-100">
          <div className="px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] border-b border-[var(--border-color)] mb-0.5 flex items-center justify-between">
            <span>{t("model", "Model")}</span>
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold border border-[var(--border-color)]">
              {activeModel?.providerID || "Active"}
            </span>
          </div>
          {modelOptions.map((m) => {
            const isSelected = m.id === activeModel?.id;
            const desc = describeModel(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModel?.(m)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-lg text-[10.5px] flex items-center justify-between gap-2 cursor-pointer transition-colors",
                  isSelected
                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                )}
              >
                <span className="truncate">{desc.label || m.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {desc.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] font-medium">
                      {desc.badge}
                    </span>
                  )}
                  {(m as any).isRetired && (
                    <span
                      className="text-[9px] px-1 py-0.2 rounded bg-[#cf6613] text-white font-normal"
                      title="Reported unavailable by provider. Click to select and retry."
                    >
                      retired
                    </span>
                  )}
                  {isSelected && <Check className="w-3 h-3 text-[var(--text-primary)] shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
