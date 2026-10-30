import { memo, type ReactNode, type ComponentType, isValidElement } from "react";
import { Check } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { useTheme } from "../../../../lib/theme";

interface MenuItemProps {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }> | ReactNode;
  iconColor?: string;
  label: string;
  shortcut?: string;
  checked?: boolean;
  rightBadge?: ReactNode;
  rightIcon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

export const MenuItem = memo(function MenuItem({
  icon,
  iconColor,
  label,
  shortcut,
  checked,
  rightBadge,
  rightIcon: RightIcon,
  disabled,
  onClick,
  className,
}: MenuItemProps) {
  const { isNeobrutalism } = useTheme();

  const renderIcon = () => {
    if (!icon) return null;

    if (!isNeobrutalism) {
      if (isValidElement(icon)) {
        return icon;
      }
      if (
        typeof icon === "function" ||
        (typeof icon === "object" && icon !== null && "$$typeof" in icon)
      ) {
        const IconComponent = icon as ComponentType<{ className?: string; strokeWidth?: number }>;
        return (
          <IconComponent
            className="w-4 h-4 text-[var(--text-muted)] shrink-0"
            strokeWidth={1.75}
          />
        );
      }
      return <>{icon}</>;
    }

    if (isValidElement(icon)) {
      return (
        <div
          className={cn(
            "neo-icon-badge w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-transform group-hover/menuitem:scale-105",
            iconColor || "bg-[#CCFF00] border border-[#141413] text-[#141413]"
          )}
        >
          {icon}
        </div>
      );
    }
    if (
      typeof icon === "function" ||
      (typeof icon === "object" && icon !== null && "$$typeof" in icon)
    ) {
      const IconComponent = icon as ComponentType<{ className?: string; strokeWidth?: number }>;
      return (
        <div
          className={cn(
            "neo-icon-badge w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-transform group-hover/menuitem:scale-105",
            iconColor || "bg-[#CCFF00] border border-[#141413] text-[#141413]"
          )}
        >
          <IconComponent className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
        </div>
      );
    }
    return (
      <div className="neo-icon-badge w-6 h-6 rounded-md flex items-center justify-center shrink-0">
        {icon}
      </div>
    );
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group/menuitem w-full px-3 py-1.5 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {renderIcon()}
        <span className="truncate">{label}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {rightBadge}
        {shortcut && (
          <span className="pl-2 text-[11px] text-[var(--text-muted)] font-mono">
            {shortcut}
          </span>
        )}
        {checked && (
          <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />
        )}
        {RightIcon && (
          <RightIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" strokeWidth={1.75} />
        )}
      </div>
    </button>
  );
});
