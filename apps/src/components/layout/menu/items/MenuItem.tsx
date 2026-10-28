import { memo, type ReactNode, type ComponentType, isValidElement } from "react";
import { Check } from "lucide-react";
import { cn } from "../../../../lib/utils";

interface MenuItemProps {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }> | ReactNode;
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
  label,
  shortcut,
  checked,
  rightBadge,
  rightIcon: RightIcon,
  disabled,
  onClick,
  className,
}: MenuItemProps) {
  const renderIcon = () => {
    if (!icon) return null;
    if (isValidElement(icon)) {
      return <div className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</div>;
    }
    if (
      typeof icon === "function" ||
      (typeof icon === "object" && icon !== null && "$$typeof" in icon)
    ) {
      const IconComponent = icon as ComponentType<{ className?: string; strokeWidth?: number }>;
      return <IconComponent className="w-4 h-4 text-[var(--text-muted)] shrink-0" strokeWidth={1.75} />;
    }
    return <div className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</div>;
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed",
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
