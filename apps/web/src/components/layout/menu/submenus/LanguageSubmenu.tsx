import { memo } from "react";
import { Languages } from "lucide-react";
import { useI18n } from "../../../../lib/i18n";
import { MenuItem } from "../items/MenuItem";

interface LanguageSubmenuProps {
  onClose: () => void;
}

export const LanguageSubmenu = memo(function LanguageSubmenu({ onClose }: LanguageSubmenuProps) {
  const { language, setLanguage, t } = useI18n();

  return (
    <>
      <div className="px-3.5 py-1 text-xs font-medium text-[var(--text-muted)] flex items-center gap-2">
        <Languages className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span>{t("language", "Language")}</span>
      </div>

      <MenuItem
        label={t("english", "English")}
        checked={language === "en"}
        icon={() => (
          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-color)]">
            EN
          </span>
        )}
        onClick={() => {
          setLanguage("en");
          onClose();
        }}
      />

      <MenuItem
        label={t("indonesian", "Bahasa Indonesia")}
        checked={language === "id"}
        icon={() => (
          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-color)]">
            ID
          </span>
        )}
        onClick={() => {
          setLanguage("id");
          onClose();
        }}
      />
    </>
  );
});
