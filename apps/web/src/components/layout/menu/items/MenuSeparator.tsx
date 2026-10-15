import { memo } from "react";

export const MenuSeparator = memo(function MenuSeparator() {
  return <div className="h-px my-1.5 bg-[var(--border-color)]" />;
});
