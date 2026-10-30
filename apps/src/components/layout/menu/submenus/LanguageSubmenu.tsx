import { memo } from "react";
import { Languages } from "lucide-react";
import { useI18n } from "../../../../lib/i18n";
import { useTheme } from "../../../../lib/theme";
import { MenuItem } from "../items/MenuItem";

interface LanguageSubmenuProps {
  onClose: () => void;
}

export const LanguageSubmenu = memo(function LanguageSubmenu({ onClose }: LanguageSubmenuProps) {
  const { language, setLanguage, t } = useI18n();
  const { isNeobrutalism } = useTheme();

  return (
    <>
      <div className="px-3.5 py-1 text-xs font-medium text-[var(--text-muted)] flex items-center gap-2">
        <Languages
          className={
            isNeobrutalism
              ? "w-3.5 h-3.5 text-[#A855F7]"
              : "w-3.5 h-3.5 text-[var(--text-muted)]"
          }
          strokeWidth={1.85}
        />
        <span>{t("language", "Language")}</span>
      </div>

      <MenuItem
        label={t("english", "English")}
        checked={language === "en"}
        icon={
          isNeobrutalism ? (
            <span className="text-[10px] font-bold font-mono text-[#141413]">EN</span>
          ) : (
            <span className="w-5 h-4 flex items-center justify-center text-[10px] font-bold font-mono rounded bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-color)]">
              EN
            </span>
          )
        }
        iconColor="bg-[#CCFF00] text-[#141413] border border-[#141413]"
        onClick={() => {
          setLanguage("en");
          onClose();
        }}
      />

      <MenuItem
        label={t("indonesian", "Bahasa Indonesia")}
        checked={language === "id"}
        icon={
          isNeobrutalism ? (
            <span className="text-[10px] font-bold font-mono text-[#141413]">ID</span>
          ) : (
            <span className="w-5 h-4 flex items-center justify-center text-[10px] font-bold font-mono rounded bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-color)]">
              ID
            </span>
          )
        }
        iconColor="bg-[#FF9F43] text-[#141413] border border-[#141413]"
        onClick={() => {
          setLanguage("id");
          onClose();
        }}
      />
    </>
  );
});
