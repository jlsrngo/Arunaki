import { useState, memo } from "react";
import {
  Monitor,
  Layers,
  ShieldCheck,
  Bell,
  Sliders,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { summarizeSession } from "../../lib/engine";
import { sendDesktopNotification } from "../../lib/notifications";
import { setSmartCompactionPref } from "../workstation/chat/useChatCompaction";
import { Card, Button } from "../ui";

export const SettingsAutomationTab = memo(function SettingsAutomationTab() {
  const { t } = useI18n();
  const { isNeobrutalism } = useTheme();
  const [autoOpenOffice, setAutoOpenOffice] = useState(
    () =>
      localStorage.getItem("arunaki_pref_auto_open_office") === "true" ||
      localStorage.getItem("arunaki_pref_auto_open_excel") === "true"
  );
  const [autoBackup, setAutoBackup] = useState(
    () => localStorage.getItem("arunaki_pref_auto_backup") !== "false"
  );
  const [desktopNotification, setDesktopNotification] = useState(
    () => localStorage.getItem("arunaki_pref_desktop_notification") !== "false"
  );
  const [smartCompaction, setSmartCompaction] = useState(
    () => localStorage.getItem("arunaki_pref_smart_compaction") !== "false"
  );
  const [isCompacting, setIsCompacting] = useState(false);
  const isDesktop = typeof window !== "undefined" && !!(window as any).arunakiDesktop;

  return (
    <div className="w-full space-y-6">
      <div>
        <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[var(--text-primary)]" />
          {t("desktopAutomationTitle")}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {t("desktopAutomationSubtitle")}
        </p>
      </div>

      {/* Interactive Setting Cards */}
      <div className="w-full space-y-4">
        {/* 1. Launch Microsoft Office on Edit */}
        <Card
          className={cn(
            "p-5 flex items-start justify-between gap-4 transition-all",
            isNeobrutalism
              ? "bg-[#FFF7ED] border-2 border-[#141413] shadow-[3px_3px_0px_#141413] rounded-2xl"
              : "bg-[var(--bg-card)] border-[var(--border-color)]"
          )}
        >
          <div className="flex gap-3.5">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                isNeobrutalism
                  ? "bg-[#FF9F43] border-2 border-[#141413] text-[#141413] shadow-[2px_2px_0px_#141413]"
                  : autoOpenOffice
                  ? "bg-[#cf6613] border-[#cf6613] text-white"
                  : "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-muted)]"
              )}
            >
              <Layers className={cn("w-4 h-4", isNeobrutalism ? "text-[#141413]" : autoOpenOffice ? "text-white" : "text-[var(--text-muted)]")} />
            </div>
            <div>
              <h4
                className={cn(
                  "text-xs font-bold",
                  isNeobrutalism ? "text-[#141413]" : "text-[var(--text-primary)]"
                )}
              >
                {t("launchOfficeTitle")}
              </h4>
              <p
                className={cn(
                  "text-[11px] leading-relaxed mt-0.5",
                  isNeobrutalism ? "text-[#141413]/80" : "text-[var(--text-muted)]"
                )}
              >
                {t("launchOfficeDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoOpenOffice}
            onClick={() => {
              const next = !autoOpenOffice;
              setAutoOpenOffice(next);
              localStorage.setItem("arunaki_pref_auto_open_office", String(next));
              localStorage.setItem("arunaki_pref_auto_open_excel", String(next));
              toast.success(
                next
                  ? "Office applications foreground launch enabled."
                  : "Office applications foreground launch disabled (headless mode)."
              );
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              isNeobrutalism
                ? autoOpenOffice
                  ? "bg-[#CCFF00] border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                  : "bg-[#EAE0D7] border-2 border-[#141413]"
                : autoOpenOffice
                ? "bg-[var(--text-primary)] border border-[var(--border-strong)]"
                : "bg-[var(--bg-panel)] border border-[var(--border-strong)]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full ring-0 transition-transform duration-200 ease-in-out",
                isNeobrutalism
                  ? autoOpenOffice
                    ? "translate-x-5 bg-[#141413]"
                    : "translate-x-0 bg-[#141413]"
                  : autoOpenOffice
                  ? "translate-x-5 bg-[var(--bg-app)]"
                  : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </Card>

        {/* 2. Automatic Snapshot Backup Before Modifications */}
        <Card
          className={cn(
            "p-5 flex items-start justify-between gap-4 transition-all",
            isNeobrutalism
              ? "bg-[#EFF6FF] border-2 border-[#141413] shadow-[3px_3px_0px_#141413] rounded-2xl"
              : "bg-[var(--bg-card)] border-[var(--border-color)]"
          )}
        >
          <div className="flex gap-3.5">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                isNeobrutalism
                  ? "bg-[#3B82F6] border-2 border-[#141413] text-white shadow-[2px_2px_0px_#141413]"
                  : autoBackup
                  ? "bg-[#cf6613] border-[#cf6613] text-white"
                  : "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-muted)]"
              )}
            >
              <ShieldCheck className={cn("w-4 h-4", isNeobrutalism ? "text-white" : autoBackup ? "text-white" : "text-[var(--text-muted)]")} />
            </div>
            <div>
              <h4
                className={cn(
                  "text-xs font-bold",
                  isNeobrutalism ? "text-[#141413]" : "text-[var(--text-primary)]"
                )}
              >
                {t("autoBackupTitle")}
              </h4>
              <p
                className={cn(
                  "text-[11px] leading-relaxed mt-0.5",
                  isNeobrutalism ? "text-[#141413]/80" : "text-[var(--text-muted)]"
                )}
              >
                {t("autoBackupDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoBackup}
            onClick={() => {
              const next = !autoBackup;
              setAutoBackup(next);
              localStorage.setItem("arunaki_pref_auto_backup", String(next));
              toast.success(next ? "Automatic backup enabled." : "Automatic backup disabled.");
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              isNeobrutalism
                ? autoBackup
                  ? "bg-[#CCFF00] border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                  : "bg-[#EAE0D7] border-2 border-[#141413]"
                : autoBackup
                ? "bg-[var(--text-primary)] border border-[var(--border-strong)]"
                : "bg-[var(--bg-panel)] border border-[var(--border-strong)]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full ring-0 transition-transform duration-200 ease-in-out",
                isNeobrutalism
                  ? autoBackup
                    ? "translate-x-5 bg-[#141413]"
                    : "translate-x-0 bg-[#141413]"
                  : autoBackup
                  ? "translate-x-5 bg-[var(--bg-app)]"
                  : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </Card>

        {/* 3. Desktop OS Notifications */}
        <Card
          className={cn(
            "p-5 flex items-start justify-between gap-4 transition-all",
            isNeobrutalism
              ? "bg-[#FEFCE8] border-2 border-[#141413] shadow-[3px_3px_0px_#141413] rounded-2xl"
              : "bg-[var(--bg-card)] border-[var(--border-color)]"
          )}
        >
          <div className="flex gap-3.5">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                isNeobrutalism
                  ? "bg-[#FACC15] border-2 border-[#141413] text-[#141413] shadow-[2px_2px_0px_#141413]"
                  : desktopNotification
                  ? "bg-[#cf6613] border-[#cf6613] text-white"
                  : "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-muted)]"
              )}
            >
              <Bell className={cn("w-4 h-4", isNeobrutalism ? "text-[#141413]" : desktopNotification ? "text-white" : "text-[var(--text-muted)]")} />
            </div>
            <div>
              <h4
                className={cn(
                  "text-xs font-bold",
                  isNeobrutalism ? "text-[#141413]" : "text-[var(--text-primary)]"
                )}
              >
                {t("desktopNotificationsTitle")}
              </h4>
              <p
                className={cn(
                  "text-[11px] leading-relaxed mt-0.5",
                  isNeobrutalism ? "text-[#141413]/80" : "text-[var(--text-muted)]"
                )}
              >
                {t("desktopNotificationsDesc")}
              </p>
              {desktopNotification && (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const ok = await sendDesktopNotification(
                        "Arunaki Workstation",
                        "Document automation task completed successfully."
                      );
                      if (ok) {
                        toast.success("Desktop test notification dispatched.");
                      } else {
                        toast.info("Test notification dispatched to OS notification center.");
                      }
                    }}
                  >
                    <Bell className="w-3 h-3 text-[var(--text-primary)]" />
                    <span>{t("testDesktopNotification")}</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={desktopNotification}
            onClick={() => {
              const next = !desktopNotification;
              setDesktopNotification(next);
              localStorage.setItem("arunaki_pref_desktop_notification", String(next));
              if (next) {
                sendDesktopNotification(
                  "Arunaki Workstation",
                  "Desktop notifications are now enabled."
                ).catch(() => {});
              }
              toast.success(
                next ? "Desktop notifications enabled." : "Desktop notifications disabled."
              );
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              isNeobrutalism
                ? desktopNotification
                  ? "bg-[#CCFF00] border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                  : "bg-[#EAE0D7] border-2 border-[#141413]"
                : desktopNotification
                ? "bg-[var(--text-primary)] border border-[var(--border-strong)]"
                : "bg-[var(--bg-panel)] border border-[var(--border-strong)]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full ring-0 transition-transform duration-200 ease-in-out",
                isNeobrutalism
                  ? desktopNotification
                    ? "translate-x-5 bg-[#141413]"
                    : "translate-x-0 bg-[#141413]"
                  : desktopNotification
                  ? "translate-x-5 bg-[var(--bg-app)]"
                  : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </Card>

        {/* 4. Smart Context Compaction & Token Pruning */}
        <Card
          className={cn(
            "p-5 flex items-start justify-between gap-4 transition-all",
            isNeobrutalism
              ? "bg-[#FAF5FF] border-2 border-[#141413] shadow-[3px_3px_0px_#141413] rounded-2xl"
              : "bg-[var(--bg-card)] border-[var(--border-color)]"
          )}
        >
          <div className="flex gap-3.5">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                isNeobrutalism
                  ? "bg-[#B388FF] border-2 border-[#141413] text-[#141413] shadow-[2px_2px_0px_#141413]"
                  : smartCompaction
                  ? "bg-[#cf6613] border-[#cf6613] text-white"
                  : "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-muted)]"
              )}
            >
              <Sparkles className={cn("w-4 h-4", isNeobrutalism ? "text-[#141413]" : smartCompaction ? "text-white" : "text-[var(--text-muted)]")} />
            </div>
            <div>
              <h4
                className={cn(
                  "text-xs font-bold",
                  isNeobrutalism ? "text-[#141413]" : "text-[var(--text-primary)]"
                )}
              >
                {t("smartCompactionTitle")}
              </h4>
              <p
                className={cn(
                  "text-[11px] leading-relaxed mt-0.5",
                  isNeobrutalism ? "text-[#141413]/80" : "text-[var(--text-muted)]"
                )}
              >
                {t("smartCompactionDesc")}
              </p>
              {smartCompaction && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isCompacting}
                    onClick={async () => {
                      const activeChatId = localStorage.getItem("arunaki_active_chat_id");
                      const activeFolder = localStorage.getItem("arunaki_active_folder") || undefined;
                      if (!activeChatId) {
                        toast.info("No active conversation session found.");
                        return;
                      }
                      setIsCompacting(true);
                      const tid = toast.loading("Compacting active session context...");
                      try {
                        const ok = await summarizeSession(activeChatId, undefined, activeFolder);
                        if (ok) {
                          toast.success("Active session context compacted successfully!", { id: tid });
                        } else {
                          toast.error("Failed to compact session context", { id: tid });
                        }
                      } catch (err: any) {
                        toast.error(`Compaction error: ${err?.message || err}`, { id: tid });
                      } finally {
                        setIsCompacting(false);
                      }
                    }}
                  >
                    <Sparkles className="w-3 h-3 text-[var(--text-primary)]" />
                    <span>{isCompacting ? "Compacting..." : t("compactActiveSessionNow")}</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={smartCompaction}
            onClick={() => {
              const next = !smartCompaction;
              setSmartCompaction(next);
              setSmartCompactionPref(next);
              toast.success(
                next
                  ? "Smart context compaction & token pruning enabled."
                  : "Smart context compaction disabled (full conversation history retained)."
              );
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              isNeobrutalism
                ? smartCompaction
                  ? "bg-[#CCFF00] border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                  : "bg-[#EAE0D7] border-2 border-[#141413]"
                : smartCompaction
                ? "bg-[var(--text-primary)] border border-[var(--border-strong)]"
                : "bg-[var(--bg-panel)] border border-[var(--border-strong)]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full ring-0 transition-transform duration-200 ease-in-out",
                isNeobrutalism
                  ? smartCompaction
                    ? "translate-x-5 bg-[#141413]"
                    : "translate-x-0 bg-[#141413]"
                  : smartCompaction
                  ? "translate-x-5 bg-[var(--bg-app)]"
                  : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </Card>
      </div>

      {/* Desktop Diagnostic Bridge Status */}
      <div
        className={cn(
          "p-5 rounded-2xl flex items-center justify-between transition-all",
          isNeobrutalism
            ? "bg-[#FFFDFB] border-2 border-[#141413] shadow-[3px_3px_0px_#141413]"
            : "bg-[var(--bg-card)] border border-[var(--border-color)]"
        )}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
              isDesktop
                ? "bg-[#cf6613] border-[#cf6613] text-white"
                : "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-muted)]"
            )}
          >
            <Monitor className={cn("w-4 h-4", isDesktop ? "text-white" : "text-[var(--text-muted)]")} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[var(--text-primary)]">
              {t("electronShellTitle")}
            </h4>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {t("electronShellDesc")}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "px-3 py-1 rounded-full text-[10px] font-semibold border flex items-center gap-1.5",
            isDesktop
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
              : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-color)]"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              isDesktop ? "bg-[var(--text-primary)]" : "bg-[var(--text-muted)]"
            )}
          />
          {isDesktop ? t("connected") : "Web Browser Mode"}
        </span>
      </div>
    </div>
  );
});
