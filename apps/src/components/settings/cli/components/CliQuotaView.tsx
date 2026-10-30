import { memo } from "react";
import { Gauge, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "../../../../lib/utils";
import type { QuotaReport } from "../types";

interface CliQuotaViewProps {
  provider: "antigravity" | "claude" | "codex" | "kiro";
  quota: QuotaReport[];
  quotaLoading: boolean;
  isEn: boolean;
  onRefreshQuota: () => void;
}

export function formatQuotaReset(resetAt: number | undefined, isEn: boolean): string {
  if (!resetAt) return "—";
  const diff = resetAt - Date.now();
  if (diff <= 0) return isEn ? "now" : "sekarang";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isEn ? `${hours}h ${mins % 60}m` : `${hours}j ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return isEn ? `${days}d ${hours % 24}h` : `${days}h ${hours % 24}j`;
}

export const CliQuotaView = memo(function CliQuotaView({
  provider,
  quota,
  quotaLoading,
  isEn,
  onRefreshQuota,
}: CliQuotaViewProps) {
  const report = quota.find((q) => q.provider === provider);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
          <Gauge className="w-3.5 h-3.5" />
          {isEn ? "Rate Limit Windows" : "Jendela Batas Rate"}
        </div>
        <button
          type="button"
          onClick={onRefreshQuota}
          disabled={quotaLoading}
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors cursor-pointer"
          title={isEn ? "Refresh quota" : "Muat ulang kuota"}
        >
          <RefreshCw className={cn("w-3 h-3", quotaLoading && "animate-spin")} />
        </button>
      </div>

      {!report || !report.ok ? (
        <div className="text-[10px] text-[var(--text-muted)]">
          {quotaLoading
            ? isEn
              ? "Loading..."
              : "Memuat..."
            : isEn
            ? "Sign in to view limits"
            : "Masuk untuk melihat batas"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {report.buckets.map((b) => {
            const rawRemaining = typeof b.remaining === "number" ? b.remaining : 0;
            const pct = Math.max(0, Math.min(100, Math.round(rawRemaining > 1 ? rawRemaining : rawRemaining * 100)));
            const bar = b.exhausted ? "bg-red-500" : pct <= 15 ? "bg-red-400" : "bg-[#e59344]";
            const tag =
              report.buckets.filter((o) => o.label === b.label).length > 1
                ? b.id.replace(/-[^-]*$/, "")
                : "";

            return (
              <div key={b.id + b.window} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="truncate text-[var(--text-muted)]" title={tag ? `${b.label} (${tag})` : b.label}>
                    {b.label}
                    {b.window === "5h" ? ` (${b.window})` : ""}
                    {tag && tag !== b.label ? ` · ${tag}` : ""}
                  </span>
                  <span className={cn("shrink-0 tabular-nums", b.exhausted ? "text-red-500" : "text-[var(--text-secondary)]")}>
                    {pct}% · {formatQuotaReset(b.resetAt, isEn)}
                  </span>
                </div>
                <div className="h-1 mt-0.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {report.buckets.some((b) => b.exhausted) && (
            <div className="flex items-center gap-1 text-[10px] text-red-500 pt-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              {isEn ? "Some models are exhausted" : "Sebagian model sudah habis"}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
