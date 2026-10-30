import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";

export interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (!open || !onOpenChange) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
      onClick={() => onOpenChange?.(false)}
    >
      {children}
    </div>
  );
}

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  hideCloseButton?: boolean;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onClose, hideCloseButton = false, onClick, ...props }, ref) => {
    const { isNeobrutalism } = useTheme();

    return (
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        className={cn(
          "relative w-full max-w-md bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-strong)] rounded-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150",
          isNeobrutalism && "neo-popup-card",
          className
        )}
        {...props}
      >
        {children}
        {onClose && !hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }
);
DialogContent.displayName = "DialogContent";

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-[var(--border-color)] pb-3.5",
        className
      )}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-sm font-bold text-[var(--text-primary)] tracking-tight leading-none",
        className
      )}
      {...props}
    />
  );
}
DialogTitle.displayName = "DialogTitle";

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs text-[var(--text-muted)] leading-relaxed mt-1", className)}
      {...props}
    />
  );
}
DialogDescription.displayName = "DialogDescription";

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 pt-3.5 border-t border-[var(--border-color)]",
        className
      )}
      {...props}
    />
  );
}
DialogFooter.displayName = "DialogFooter";

