import { useState, memo } from "react";
import {
  Monitor,
  Layers,
  ShieldCheck,
  Bell,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

export const SettingsAutomationTab = memo(function SettingsAutomationTab() {
  const { t } = useI18n();
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

      {/* Interactive Setting Cards (Monochrome) */}
      <div className="w-full space-y-4">
        {/* 1. Launch Microsoft Office on Edit */}
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-start justify-between gap-4">
          <div className="flex gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] flex items-center justify-center shrink-0 border border-[var(--border-strong)]">
              <Layers className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                {t("launchOfficeTitle")}
              </h4>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-0.5">
                {t("launchOfficeDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
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
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-[var(--border-strong)] items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              autoOpenOffice ? "bg-[var(--text-primary)]" : "bg-[var(--bg-panel)]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full shadow-sm ring-0 transition-transform duration-200 ease-in-out",
                autoOpenOffice ? "translate-x-5 bg-[var(--bg-app)]" : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </div>

        {/* 2. Auto-Backup Dokumen Sebelum Dimodifikasi */}
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-start justify-between gap-4">
          <div className="flex gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] flex items-center justify-center shrink-0 border border-[var(--border-strong)]">
              <ShieldCheck className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                {t("autoBackupTitle")}
              </h4>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-0.5">
                {t("autoBackupDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !autoBackup;
              setAutoBackup(next);
              localStorage.setItem("arunaki_pref_auto_backup", String(next));
              toast.success(next ? "Automatic backup enabled." : "Automatic backup disabled.");
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-[var(--border-strong)] items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              autoBackup ? "bg-[var(--text-primary)]" : "bg-[var(--bg-panel)]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full shadow-sm ring-0 transition-transform duration-200 ease-in-out",
                autoBackup ? "translate-x-5 bg-[var(--bg-app)]" : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </div>

        {/* 3. Notifikasi Panel Windows */}
        <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-start justify-between gap-4">
          <div className="flex gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] flex items-center justify-center shrink-0 border border-[var(--border-strong)]">
              <Bell className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                {t("desktopNotificationsTitle")}
              </h4>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-0.5">
                {t("desktopNotificationsDesc")}
              </p>
              {desktopNotification && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
                      if (desktop?.notify) {
                        desktop.notify({
                          title: "Arunaki Workstation",
                          body: "Document automation task completed successfully.",
                        });
                        toast.success("Desktop test notification dispatched.");
                      } else if (typeof window !== "undefined" && "Notification" in window) {
                        if (Notification.permission === "granted") {
                          new Notification("Arunaki Workstation", {
                            body: "Document automation task completed successfully.",
                          });
                          toast.success("Desktop test notification dispatched.");
                        } else {
                          Notification.requestPermission().then((perm) => {
                            if (perm === "granted") {
                              new Notification("Arunaki Workstation", {
                                body: "Document automation task completed successfully.",
                              });
                              toast.success("Desktop test notification dispatched.");
                            } else {
                              toast.warning("Notification permission denied in browser.");
                            }
                          });
                        }
                      } else {
                        toast.info("Native notifications are active inside Electron desktop shell.");
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] text-[var(--text-primary)] text-[11px] font-medium border border-[var(--border-color)] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Bell className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>{t("testDesktopNotification")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !desktopNotification;
              setDesktopNotification(next);
              localStorage.setItem("arunaki_pref_desktop_notification", String(next));
              if (next && typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted") {
                Notification.requestPermission().catch(() => {});
              }
              toast.success(
                next ? "Desktop notifications enabled." : "Desktop notifications disabled."
              );
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-[var(--border-strong)] items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              desktopNotification ? "bg-[var(--text-primary)]" : "bg-[var(--bg-panel)]"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full shadow-sm ring-0 transition-transform duration-200 ease-in-out",
                desktopNotification
                  ? "translate-x-5 bg-[var(--bg-app)]"
                  : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </div>
      </div>

      {/* Electron Diagnostic Bridge Status */}
      <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] flex items-center justify-center shrink-0 border border-[var(--border-strong)]">
            <Monitor className="w-4 h-4 text-[var(--text-muted)]" />
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
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-zinc-800/80 text-zinc-400 border-zinc-700/60"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              isDesktop ? "bg-emerald-400" : "bg-zinc-500"
            )}
          />
          {isDesktop ? t("connected") : "Web Browser Mode"}
        </span>
      </div>
    </div>
  );
});
