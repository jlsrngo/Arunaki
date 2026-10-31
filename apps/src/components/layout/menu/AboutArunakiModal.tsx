import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { Check } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { useTheme } from "../../../lib/theme";
import { cn } from "../../../lib/utils";
import { Dialog, DialogContent, Button } from "../../ui";

// Substituted by vite `define` at build time; see apps/vite.config.ts.
declare const __ARUNAKI_COMMIT__: string;
declare const __ARUNAKI_BUILD_DATE__: string;
declare const __ARUNAKI_VERSION__: string;

interface AboutArunakiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutArunakiModal = memo(function AboutArunakiModal({
  isOpen,
  onClose,
}: AboutArunakiModalProps) {
  const [copied, setCopied] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{
    runtime?: string;
    engine?: string;
    desktop?: string;
    docs?: string;
    os?: string;
  } | null>(null);
  const { t } = useI18n();
  const { isNeobrutalism } = useTheme();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Dynamically load active runtime stack from backend engine-info
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    async function loadInfo() {
      try {
        const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
        if (desktop?.getEngineInfo) {
          const info = await desktop.getEngineInfo();
          if (active && info) setEngineInfo(info);
          return;
        }
        const res = await fetch("/api/desktop/engine-info");
        if (res.ok) {
          const info = await res.json();
          if (active && info) setEngineInfo(info);
        }
      } catch {}
    }
    loadInfo();
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Clean, modern Native Rust architecture specifications.
  // Outdated Electron/Node.js/V8 lines are completely eliminated.
  const specs = useMemo(() => {
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    const sys = desktop?.getSystemInfo ? desktop.getSystemInfo() : null;
    const chromeMatch = typeof navigator !== "undefined" ? navigator.userAgent.match(/Chrome\/([0-9.]+)/) : null;
    const info = engineInfo || sys || {};

    const list = [
      { label: t("version", "Version"), value: __ARUNAKI_VERSION__ },
      { label: "Commit", value: __ARUNAKI_COMMIT__ },
      { label: t("buildDate", "Build Date"), value: __ARUNAKI_BUILD_DATE__ },
      { label: "Runtime", value: info.runtime || "Native Rust Hybrid" },
      { label: "Desktop Shell", value: info.desktop || "Tauri v2 + Microsoft Edge WebView2" },
      { label: "AI Engine", value: info.engine || "Axum v0.7 + Tokio v1.40" },
      { label: "Document Sidecar", value: info.docs || "Native Win32 COM (arunaki-docs)" },
      { label: "Web Renderer", value: `Microsoft Edge WebView2 (Chromium ${chromeMatch?.[1] || "system"})` },
      { label: "OS", value: info.os || sys?.os || "Windows_NT x64" },
      { label: t("isolation", "Isolation"), value: t("activeFolderSandbox", "Active Folder Sandbox") },
    ];

    // Filter out any empty lines or legacy unavailable placeholders
    return list.filter((item) => Boolean(item.value && !item.value.toLowerCase().includes("unavailable")));
  }, [engineInfo, isOpen, t]);

  const fullSpecsText = useMemo(() => {
    return specs.map((item) => `${item.label}: ${item.value}`).join("\n");
  }, [specs]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullSpecsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments that restrict clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = fullSpecsText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [fullSpecsText]);

  // Strict React Hook ordering: early return after all hooks
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onClose={onClose}
        className={cn(
          "max-w-[540px] p-7 select-text transition-all",
          isNeobrutalism && "bg-[#FFF9E6] border-2 border-[#141413] shadow-[5px_5px_0px_#141413] rounded-2xl"
        )}
      >
        {/* Content layout: Left circle icon + Right content column */}
        <div className="flex items-start gap-5">
          {/* Circular info badge */}
          <div
            className={cn(
              "shrink-0 pt-0.5 select-none text-[var(--text-primary)]",
              isNeobrutalism &&
                "neo-icon-badge w-11 h-11 rounded-full bg-[#B388FF] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] flex items-center justify-center pt-0"
            )}
          >
            <svg
              className={cn("w-11 h-11", isNeobrutalism && "w-6 h-6")}
              viewBox="0 0 44 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {!isNeobrutalism && (
                <circle
                  cx="22"
                  cy="22"
                  r="19.5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              )}
              <circle cx="22" cy="14" r="2.5" fill="currentColor" />
              <rect
                x="20"
                y="18.5"
                width="4"
                height="14"
                rx="1.2"
                fill="currentColor"
              />
            </svg>
          </div>

          {/* Right column: Title, Specs, Buttons */}
          <div className="flex-1 min-w-0">
            <h2 className="text-[19px] font-semibold text-[var(--text-primary)] leading-tight mb-4 select-text">
              Arunaki
            </h2>

            {/* Spec lines */}
            <div className="space-y-[3px] text-[13px] leading-[22px] select-text">
              {specs.map((item) => (
                <div key={item.label} className="break-all flex flex-wrap">
                  <span className="text-[var(--text-muted)] font-normal mr-1.5">
                    {item.label}:
                  </span>
                  <span className="text-[var(--text-secondary)] font-mono text-[12.5px]">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons bottom-right */}
            <div className="flex items-center justify-end gap-2.5 mt-6 select-none">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                className={cn(
                  "min-w-[72px]",
                  isNeobrutalism &&
                    "bg-[#FFFDFB] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:bg-[#F3EBE4] font-semibold"
                )}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                    <span>{t("done", "Done")}</span>
                  </>
                ) : (
                  <span>{t("copy", "Copy")}</span>
                )}
              </Button>

              <Button
                type="button"
                variant="default"
                onClick={onClose}
                className={cn(
                  "min-w-[58px]",
                  isNeobrutalism &&
                    "bg-[#CCFF00] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] font-bold hover:bg-[#B388FF]"
                )}
              >
                {t("done", "OK")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
