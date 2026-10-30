import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-medium transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--text-primary)] text-[var(--bg-app)] border border-[var(--border-primary)] hover:opacity-90 font-semibold",
        brand:
          "bg-[#cf6613] text-white border border-[#cf6613] hover:bg-[#b8550f] font-semibold",
        destructive:
          "bg-rose-600 text-white border border-rose-600 hover:bg-rose-500 font-semibold",
        outline:
          "border border-[var(--border-strong)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
        secondary:
          "bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--bg-panel)] hover:border-[var(--border-strong)]",
        ghost:
          "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent",
        "ghost-destructive":
          "text-[var(--text-muted)] hover:text-white hover:bg-rose-600 border border-transparent",
        link: "text-[var(--text-primary)] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-8 px-3.5 py-1.5 text-xs",
        sm: "h-7 rounded-md px-2.5 py-1 text-[11px]",
        lg: "h-9 rounded-xl px-4 py-2 text-xs",
        icon: "h-8 w-8 rounded-lg p-0",
        "icon-sm": "h-7 w-7 rounded-md p-0",
        "icon-xs": "h-6 w-6 rounded-md p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Optional Neo-Brutalist color override when Neo-Brutalism theme is active */
  neoColor?: "lime" | "orange" | "purple" | "white";
}

const NEO_COLOR_MAP: Record<NonNullable<ButtonProps["neoColor"]>, string> = {
  lime: "bg-[#CCFF00] text-[#141413] border-[#141413] hover:bg-[#FF9F43]",
  orange: "bg-[#FF9F43] text-[#141413] border-[#141413] hover:bg-[#CCFF00]",
  purple: "bg-[#B388FF] text-[#141413] border-[#141413] hover:bg-[#CCFF00]",
  white: "bg-[#FFFDFB] text-[#141413] border-[#141413] hover:bg-[#CCFF00]",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", neoColor, type = "button", ...props }, ref) => {
    const { isNeobrutalism } = useTheme();

    const neoVariantClasses = React.useMemo(() => {
      if (!isNeobrutalism) return "";
      if (neoColor) {
        return cn("border border-[#141413] font-semibold", NEO_COLOR_MAP[neoColor]);
      }
      switch (variant) {
        case "default":
          return "bg-[#CCFF00] text-[#141413] border border-[#141413] hover:bg-[#FF9F43] font-semibold";
        case "brand":
          return "bg-[#FF9F43] text-[#141413] border border-[#141413] hover:bg-[#CCFF00] font-semibold";
        case "destructive":
          return "bg-[#FF5964] text-white border border-[#141413] hover:bg-rose-600 font-semibold";
        case "ghost-destructive":
          return "text-[#141413] hover:text-white hover:bg-[#FF5964] border border-transparent hover:border-[#141413]";
        case "outline":
        case "secondary":
          return "bg-[#FFFDFB] text-[#141413] border border-[#141413] hover:bg-[#CCFF00]";
        default:
          return "";
      }
    }, [isNeobrutalism, neoColor, variant]);

    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), neoVariantClasses, className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

