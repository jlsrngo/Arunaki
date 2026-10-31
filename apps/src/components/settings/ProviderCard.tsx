import { memo, useState } from "react";
import { Loader2, Wifi, Trash2, ArrowUp, ArrowDown, Settings2, Info, X, Terminal } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import type { Provider } from "./ModelProviderSettings";
import { formatToastError } from "./constants";
import { Card, Button, Badge } from "../ui";

const NEO_CARD_TINTS = [
  "bg-[#EFF6FF]", // Blue
  "bg-[#FFF7ED]", // Orange
  "bg-[#FAF5FF]", // Purple
  "bg-[#FEFCE8]", // Yellow
  "bg-[#ECFDF5]", // Mint
  "bg-[#FFF1F2]", // Rose
];

function getSelectedModels(modelStr: string): string[] {
  if (!modelStr) return [];
  return modelStr.split(",").map((s) => s.trim()).filter(Boolean);
}

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

export const ProviderCard = memo(function ProviderCard({
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
  const { isNeobrutalism } = useTheme();
  const [showTestDetails, setShowTestDetails] = useState(false);

  const selectedModels = getSelectedModels(p.model);
  const neoTint = NEO_CARD_TINTS[index % NEO_CARD_TINTS.length];

  return (
    <Card
      className={cn(
        "p-4 rounded-2xl transition-all space-y-3",
        isNeobrutalism
          ? `${neoTint} border-2 border-[#141413] shadow-[3px_3px_0px_#141413]`
          : p.active
          ? "bg-[var(--bg-panel)] border-[var(--border-strong)]"
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
                onClick={(e) => {
                  e.stopPropagation();
                  onMovePriority(index, "up");
                }}
                className="p-1 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] active:scale-90 disabled:opacity-20 cursor-pointer transition-transform"
                title={t("moveProviderUp")}
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={index === totalProviders - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onMovePriority(index, "down");
                }}
                className="p-1 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] active:scale-90 disabled:opacity-20 cursor-pointer transition-transform"
                title={t("moveProviderDown")}
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Clean High-Contrast Switch & Status */}
          <div className="flex items-center gap-2 shrink-0 mt-0.5 select-none">
            <button
              type="button"
              role="switch"
              aria-checked={p.active}
              onClick={(e) => {
                e.stopPropagation();
                onToggleActive(p);
              }}
              title={
                p.active
                  ? t("clickToTurnOffDivertCli", "Click to turn OFF & divert routing to CLI / Local Agent")
                  : t("clickToTurnOnPrimary", "Click to turn ON as Primary API Provider")
              }
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full items-center p-0.5 transition-colors duration-200 focus:outline-none",
                isNeobrutalism
                  ? p.active
                    ? "bg-[#CCFF00] border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                    : "bg-[#EAE0D7] border-2 border-[#141413]"
                  : p.active
                  ? "bg-[var(--text-primary)] border border-[var(--border-strong)]"
                  : "bg-[var(--bg-panel)] border border-[var(--border-strong)]"
              )}
            >
              <span
                className={cn(
                  "neo-switch-thumb pointer-events-none inline-block h-5 w-5 transform rounded-full transition duration-200 ease-in-out",
                  isNeobrutalism
                    ? "bg-[#141413] border border-[#141413]"
                    : "bg-white shadow-sm ring-0",
                  p.active ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
            {p.active && (
              <span
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider",
                  isNeobrutalism
                    ? "bg-[#CCFF00] text-[#141413] border-2 border-[#141413] shadow-[1px_1px_0px_#141413]"
                    : "bg-[var(--text-primary)] text-[var(--bg-app)]"
                )}
              >
                Primary
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-[var(--text-primary)] text-sm">{p.name}</h4>
              <Badge variant="outline" className="font-mono">
                {p.type}
              </Badge>

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
                      : "bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-color)]"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", result.success ? "bg-[var(--text-primary)]" : "bg-[var(--text-muted)]")} />
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onTestConnection(p.id)}
            disabled={isTesting}
            title={t("testPing")}
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            )}
            <span>{isTesting ? t("testing") : t("testPing")}</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onEdit(p)}
          >
            <Settings2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{t("configure")}</span>
          </Button>

          <Button
            type="button"
            variant="ghost-destructive"
            size="icon"
            onClick={() => onDelete(p.id)}
            title={t("deleteProvider")}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
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
    </Card>
  );
});
