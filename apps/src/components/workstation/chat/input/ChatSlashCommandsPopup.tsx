import { memo, type ComponentType } from "react";
import { cn } from "../../../../lib/utils";
import { useI18n } from "../../../../lib/i18n";

export interface SlashCommandItem {
  name: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}

interface ChatSlashCommandsPopupProps {
  showCommands: boolean;
  filteredCommands: SlashCommandItem[];
  selectedCommandIndex: number;
  onSelectCommand: (cmdName: string) => void;
}

export const ChatSlashCommandsPopup = memo(function ChatSlashCommandsPopup({
  showCommands,
  filteredCommands,
  selectedCommandIndex,
  onSelectCommand,
}: ChatSlashCommandsPopupProps) {
  const { t } = useI18n();

  if (!showCommands || filteredCommands.length === 0) return null;

  return (
    <div className="neo-popup-card absolute bottom-full left-0 right-0 mb-2 z-50 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl overflow-hidden transform-gpu will-change-transform">
      <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-hover)] border-b border-[var(--border-color)]">
        {t("slashCommands", "Slash Commands")}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filteredCommands.map((command, index) => {
          const Icon = command.icon;
          return (
            <button
              key={command.name}
              type="button"
              onClick={() => onSelectCommand(command.name)}
              className={cn(
                "w-full px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--bg-hover)]",
                index === selectedCommandIndex ? "bg-[var(--bg-hover)] font-medium" : ""
              )}
            >
              <Icon size={14} className="text-[var(--text-muted)] shrink-0" strokeWidth={1.5} />
              <span className="text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0">
                {command.name}
              </span>
              <span className="text-[10px] text-[var(--text-dim)] truncate min-w-0">
                {command.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
