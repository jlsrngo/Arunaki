import { memo } from "react";
import { Sun, Moon, Laptop, Box } from "lucide-react";
import { useTheme } from "../../../../lib/theme";
import { useI18n } from "../../../../lib/i18n";
import { MenuItem } from "../items/MenuItem";

interface ThemeSubmenuProps {
  onClose: () => void;
}

export const ThemeSubmenu = memo(function ThemeSubmenu({ onClose }: ThemeSubmenuProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <>
      <div className="px-3.5 py-1 text-xs font-medium text-[var(--text-muted)]">
        {t("theme", "Theme")}
      </div>

      <MenuItem
        icon={Sun}
        iconColor="bg-[#FF9F43] text-[#141413] border border-[#141413]"
        label={t("light", "Light")}
        checked={theme === "light"}
        onClick={() => {
          setTheme("light");
          onClose();
        }}
      />

      <MenuItem
        icon={Moon}
        iconColor="bg-[#B388FF] text-[#141413] border border-[#141413]"
        label={t("dark", "Dark")}
        checked={theme === "dark"}
        onClick={() => {
          setTheme("dark");
          onClose();
        }}
      />

      <MenuItem
        icon={Box}
        iconColor="bg-[#CCFF00] text-[#141413] border border-[#141413]"
        label={t("neobrutalism", "Neo-Brutalism")}
        checked={theme === "neobrutalism"}
        onClick={() => {
          setTheme("neobrutalism");
          onClose();
        }}
      />

      <MenuItem
        icon={Laptop}
        iconColor="bg-[#FF9F43] text-[#141413] border border-[#141413]"
        label={t("systemTheme", "System Theme")}
        checked={theme === "system"}
        onClick={() => {
          setTheme("system");
          onClose();
        }}
      />
    </>
  );
});
