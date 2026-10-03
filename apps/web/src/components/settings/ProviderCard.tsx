import { useState } from "react";
import { Loader2, Wifi, Trash2, ArrowUp, ArrowDown, Settings2, Info, X, Terminal } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import type { Provider } from "./ModelProviderSettings";
import { formatToastError } from "./constants";

interface ProviderCardProps {
  provider: Provider;
  index: number;
  totalProviders: number;
  testResult?: { success: boolean; status?: number; error?: string; prompt?: string; reply?: string; model?: string; timeMs?: number };
  isTesting: boolean;
  onToggleActive: (p: Provider) => void;
  onMovePriority?: (index: number, direction: "up" | "down") => void;
  onTestConnection: (id: string) => void;
  onEdit: (p: Provider) => void;
  onDelete: (id: string) => void;
}

export function ProviderCard({
  provider: p,
  index,
  totalProviders,
  testResult: result,
  isTesting,
  onToggleActive,
  onMovePriority,
  onTestConnection,
  onEdit,
  onDelete,
}: ProviderCardProps) {
  const { t } = useI18n();
  const [showTestDetails, setShowTestDetails] = useState(false);

  const getSelectedModels = (modelStr: string): string[] => {
    if (!modelStr) return [];
    return modelStr.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const selectedModels = getSelectedModels(p.model);

  return (
    <div
      className={cn(
        "p-4 rounded-2xl border transition-all space-y-3",
        p.active
          ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
          : "bg-[var(--bg-card)] border-[var(--border-color)] opacity-90 hover:opacity-100"
      )}
    >
      {/* Top Row: Priority Controls, Primary Status, Info */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Priority Reordering Buttons */}
          {onMovePriority && totalProviders > 1 && (
            <div className="flex flex-col gap-1 items-center justify-center pt-0.5 shrink-0">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMovePriority(index, "up")}
                className="p-1 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 cursor-pointer transition-colors"
                title={t("moveProviderUp")}
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={index === totalProviders - 1}
                onClick={() => onMovePriority(index, "down")}
                className="p-1 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 cursor-pointer transition-colors"
                title={t("moveProviderDown")}
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* ON / OFF Toggle Switch */}
          <button
            type="button"
            onClick={() => onToggleActive(p)}
            title={
              p.active
                ? "Klik untuk mematikan (OFF) & mengalihkan rute ke CLI / Local Agent"
                : "Klik untuk menyalakan (ON) sebagai Primary API Provider"
            }
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs select-none",
              p.active
                ? "bg-white text-zinc-950 border-white hover:bg-zinc-200"
                : "bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border-zinc-700 hover:border-zinc-500"
            )}
          >
            {/* Switch Track & Thumb */}
            <div
              className={cn(
                "w-7 h-4 rounded-full p-0.5 transition-colors flex items-center shrink-0",
                p.active ? "bg-zinc-950" : "bg-zinc-700"
              )}
            >
              <div
                className={cn(
                  "w-3 h-3 rounded-full transition-transform duration-150 shadow-xs",
                  p.active ? "bg-white translate-x-3" : "bg-zinc-400 translate-x-0"
                )}
              />
            </div>
            <span>{p.active ? "ON" : "OFF"}</span>
            {p.active && (
              <span className="text-[10px] font-medium opacity-70 border-l border-zinc-950/20 pl-1.5">
                Primary
              </span>
            )}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-[var(--text-primary)] text-sm">{p.name}</h4>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md text-[var(--text-muted)]">
                {p.type}
              </span>

              {/* Clickable Inline Test Result Badge */}
              {result && (
                <button
                  type="button"
                  onClick={() => setShowTestDetails(!showTestDetails)}
                  title={t("clickToViewPing")}
                  className={cn(
                    "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                    result.success
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", result.success ? "bg-[var(--text-primary)]" : "bg-red-400")} />
                  <span>{result.success ? `${t("connected")} (${result.timeMs}ms)` : `${t("failed")}: ${formatToastError(result.error) || result.status}`}</span>
                  <Info className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <p className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[280px]">
                {p.baseUrl || t("defaultEndpoint")}
              </p>
              {p.model && (
                <span className="text-[10px] text-[var(--text-primary)] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md">
                  {t("modelPool")} ({selectedModels.length}): {p.model}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onTestConnection(p.id)}
            disabled={isTesting}
            className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 font-medium shadow-xs"
            title={t("testPing")}
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            )}
            <span>{isTesting ? t("testing") : t("testPing")}</span>
          </button>

          <button
            onClick={() => onEdit(p)}
            className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-colors cursor-pointer font-medium flex items-center gap-1.5 shadow-xs"
          >
            <Settings2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{t("configure")}</span>
          </button>

          <button
            onClick={() => onDelete(p.id)}
            className="p-2 text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-hover)] rounded-xl cursor-pointer transition-colors"
            title={t("deleteProvider")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* EXPANDABLE TEST RESULT INSPECTION CARD */}
      {result && showTestDetails && (
        <div className="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-strong)] text-xs font-mono space-y-2 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5">
            <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              {t("pingInspectionDetails")}
            </span>
            <button
              type="button"
              onClick={() => setShowTestDetails(false)}
              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[var(--text-muted)] block">{t("promptSent")}</span>
              <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] mt-0.5">
                {result.prompt ? `"${result.prompt}"` : '"Hello, connection test."'}
              </p>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block">{t("llmReplyReceived")}</span>
              <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] font-semibold mt-0.5">
                {result.reply ? `"${result.reply}"` : result.error || "No text content"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] pt-1">
            <span>{t("latency")} <strong className="text-[var(--text-primary)]">{result.timeMs}ms</strong></span>
            <span>{t("status")} <strong className="text-[var(--text-primary)]">HTTP {result.status || (result.success ? 200 : 500)}</strong></span>
            <span>{t("endpoint")} <strong className="text-[var(--text-primary)] truncate">{p.baseUrl}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
