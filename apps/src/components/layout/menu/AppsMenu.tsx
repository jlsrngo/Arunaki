import { memo } from "react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import { BaseMenuProps } from "./types";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";
import { MenuItem } from "./items/MenuItem";
import { AppCommands } from "./hooks/useAppCommands";

interface AppsMenuProps extends BaseMenuProps {
  commands: AppCommands;
}

export const AppsMenu = memo(function AppsMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  commands,
}: AppsMenuProps) {
  const { t } = useI18n();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={onMouseEnter}
        {...menuTriggerProps(isOpen)}
        className={cn(
          "text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer",
          isOpen && "bg-[var(--bg-hover)] text-[var(--text-primary)]"
        )}
      >
        {t("apps", "Apps")}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("apps", "Apps")}
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[280px] max-w-[340px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl py-1.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3.5 py-1 text-[11px] font-semibold text-[var(--text-muted)] tracking-wider uppercase">
            ArtCraft Suite
          </div>

          <MenuItem
            icon={
              <img
                src="/artcraft/gridcraft/gridcraft.png"
                alt="GridCraft"
                className="w-4 h-4 rounded-xs object-contain shrink-0"
              />
            }
            label="GridCraft"
            rightBadge={
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                .xlsx / .csv
              </span>
            }
            onClick={() => {
              commands.openApp("gridcraft");
              onClose();
            }}
          />

          <MenuItem
            icon={
              <img
                src="/artcraft/wordcraft/wordcraft.png"
                alt="WordCraft"
                className="w-4 h-4 rounded-xs object-contain shrink-0"
              />
            }
            label="WordCraft"
            rightBadge={
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                .docx / canvas
              </span>
            }
            onClick={() => {
              commands.openApp("wordcraft");
              onClose();
            }}
          />

          <MenuItem
            icon={
              <img
                src="/artcraft/pdfcraft/pdfcraft.png"
                alt="PdfCraft"
                className="w-4 h-4 rounded-xs object-contain shrink-0"
              />
            }
            label="PdfCraft"
            rightBadge={
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                .pdf
              </span>
            }
            onClick={() => {
              commands.openApp("pdfcraft");
              onClose();
            }}
          />

          <MenuItem
            icon={
              <img
                src="/artcraft/deckcraft/deckcraft.png"
                alt="DeckCraft"
                className="w-4 h-4 rounded-xs object-contain shrink-0"
              />
            }
            label="DeckCraft"
            rightBadge={
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                .pptx / slide
              </span>
            }
            onClick={() => {
              commands.openApp("deckcraft");
              onClose();
            }}
          />
        </div>
      )}
    </div>
  );
});
