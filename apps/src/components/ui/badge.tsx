import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors select-none shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-[var(--border-strong)] bg-[var(--text-primary)] text-[var(--bg-app)]",
        brand:
          "border-[#cf6613]/30 bg-[#cf6613]/15 text-[#cf6613]",
        secondary:
          "border-[var(--border-color)] bg-[var(--bg-hover)] text-[var(--text-primary)]",
        destructive:
          "border-rose-600 bg-rose-600 text-white",
        danger:
          "border-rose-500/30 bg-rose-500/15 text-rose-400",
        outline:
          "border-[var(--border-strong)] bg-[var(--bg-card)] text-[var(--text-secondary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  neoColor?: "lime" | "orange" | "purple";
}

const NEO_BADGE_MAP: Record<NonNullable<BadgeProps["neoColor"]>, string> = {
  lime: "bg-[#CCFF00] text-[#141413] border-[#141413]",
  orange: "bg-[#FF9F43] text-[#141413] border-[#141413]",
  purple: "bg-[#B388FF] text-[#141413] border-[#141413]",
};

function Badge({ className, variant = "default", neoColor, ...props }: BadgeProps) {
  const { isNeobrutalism } = useTheme();

  const neoClass = React.useMemo(() => {
    if (!isNeobrutalism) return "";
    if (neoColor) return NEO_BADGE_MAP[neoColor];
    if (variant === "default") return "bg-[#CCFF00] text-[#141413] border-[#141413]";
    if (variant === "brand") return "bg-[#FF9F43] text-[#141413] border-[#141413]";
    if (variant === "secondary") return "bg-[#B388FF] text-[#141413] border-[#141413]";
    if (variant === "danger" || variant === "destructive") return "bg-[#FF5964] text-white border-[#141413]";
    return "";
  }, [isNeobrutalism, neoColor, variant]);

  return (
    <span
      className={cn(badgeVariants({ variant }), neoClass, className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

