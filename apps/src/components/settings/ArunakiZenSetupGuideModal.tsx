import { useState, useEffect } from "react";
import {
  BookOpen,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

interface ArunakiZenSetupGuideModalProps {
  isOpen: boolean;
  initialStep?: number;
  hostUrl?: string;
  onClose: () => void;
}

export function ArunakiZenSetupGuideModal({
  isOpen,
  initialStep = 1,
  hostUrl = "",
  onClose,
}: ArunakiZenSetupGuideModalProps) {
  const activeUrl = hostUrl.trim();
  const { t } = useI18n();
  const tr = (k: string, fb: string) => (t as any)(k, fb);
  const [guideStep, setGuideStep] = useState(initialStep);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGuideStep(initialStep);
    }
  }, [isOpen, initialStep]);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    toast.success(`Copied to clipboard: ${text}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 select-none">
      <div className="max-w-xl w-full bg-[var(--bg-panel)] rounded-2xl border border-[var(--border-strong)] shadow-2xl p-6 space-y-5 relative animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                {tr("zenGuideModalTitle", "ArunakiZen Connection Guide")}
              </h4>
              <p className="text-[11px] text-[var(--text-muted)]">
                {tr(
                  "zenGuideModalSubtitle",
                  "Connect Arunaki Agent to your ArunakiZen retail transaction engine"
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-app)] rounded-xl border border-[var(--border-color)]">
          {[
            { step: 1, label: tr("zenStep1Tab", "1. Server Host") },
            { step: 2, label: tr("zenStep2Tab", "2. API Key") },
            { step: 3, label: tr("zenStep3Tab", "3. Cashier ID") },
            { step: 4, label: tr("zenStep4Tab", "4. Sync Test") },
          ].map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setGuideStep(s.step)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center",
                guideStep === s.step
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-strong)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Step Body Content */}
        <div className="min-h-[220px]">
          {guideStep === 1 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </span>
                <h5 className="text-xs font-bold text-[var(--text-primary)]">
                  {tr("zenStep1Title", "ArunakiZen Host URL & Port Detection")}
                </h5>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {tr(
                  "zenStep1Desc",
                  "ArunakiZen runs locally on your machine on port 5000 by default. If multiple services are running, it dynamically falls back between port 5000 and 5100."
                )}
              </p>
              <div className="p-3 bg-[var(--bg-app)] rounded-xl border border-[var(--border-color)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)] font-medium">
                    {activeUrl
                      ? tr("zenDetectedUrl", "Configured / Detected Host URL:")
                      : tr("zenUrlFormatLabel", "Host URL Format (Local or LAN):")}
                  </span>
                  {activeUrl && (
                    <button
                      type="button"
                      onClick={() => handleCopy(activeUrl, "url")}
                      className="flex items-center gap-1 text-[11px] text-[var(--text-primary)] hover:underline cursor-pointer"
                    >
                      {copiedCode === "url" ? (
                        <Check className="w-3 h-3 text-white" />
                      ) : (
                        <Copy className="w-3 h-3 text-[var(--text-muted)]" />
                      )}
                      <span>{copiedCode === "url" ? "Copied" : "Copy"}</span>
                    </button>
                  )}
                </div>
                <code className="block text-xs font-mono font-semibold text-[var(--text-primary)] bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-color)]">
                  {activeUrl || "http://<server-ip-or-localhost>:<port>"}
                </code>
              </div>
              <p className="text-[11px] text-[var(--text-dim)]">
                {tr(
                  "zenAutoDetectHint",
                  "Tip: Click the 'Auto Detect' button next to the host input anytime to automatically discover your running ArunakiZen server."
                )}
              </p>
            </div>
          )}

          {guideStep === 2 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </span>
                <h5 className="text-xs font-bold text-[var(--text-primary)]">
                  {tr("zenStep2Title", "Integration API Key (Bearer Token)")}
                </h5>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {tr(
                  "zenStep2Desc",
                  "Arunaki Agent requires an authorized Bearer Token to access atomic sales order execution, stock queries, and drawer audits."
                )}
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-[var(--text-secondary)] pl-1">
                <li>{tr("zenStep2Sub1", "Open the ArunakiZen desktop app.")}</li>
                <li>{tr("zenStep2Sub2", "Navigate to Settings > Integration & API Key.")}</li>
                <li>{tr("zenStep2Sub3", "Click 'Generate Token' or copy the active integration key.")}</li>
                <li>{tr("zenStep2Sub4", "Paste the key into the 'Integration API Key' field.")}</li>
              </ol>
            </div>
          )}

          {guideStep === 3 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-xs font-bold shrink-0">
                  3
                </span>
                <h5 className="text-xs font-bold text-[var(--text-primary)]">
                  {tr("zenStep3Title", "Cashier Operator Code & Authentication")}
                </h5>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {tr(
                  "zenStep3Desc",
                  "Transactions and inventory deductions in ArunakiZen must be tied to a valid cashier identity for regulatory compliance and audit logs."
                )}
              </p>
              <div className="p-3 bg-[var(--bg-app)] rounded-xl border border-[var(--border-color)] space-y-1.5 text-xs text-[var(--text-secondary)]">
                <p>
                  <strong>{tr("zenOperatorUserLabel", "Operator Code:")}</strong> {tr("zenOperatorUserHint", "Your registered cashier username (e.g., OPERATOR or cashier01). Normal uppercase and lowercase are supported.")}
                </p>
                <p>
                  <strong>{tr("zenOperatorPassLabel", "Operator Password:")}</strong> {tr("zenOperatorPassHint", "The cashier shift PIN or password used to authorize register operations.")}
                </p>
              </div>
            </div>
          )}

          {guideStep === 4 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center text-xs font-bold shrink-0">
                  4
                </span>
                <h5 className="text-xs font-bold text-[var(--text-primary)]">
                  {tr("zenStep4Title", "Test Connection & Ready to Work")}
                </h5>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {tr(
                  "zenStep4Desc",
                  "Click 'Test Connection' below the credentials form. Once verified, the Connected Store name and Active Operator badge will light up!"
                )}
              </p>
              <div className="flex items-center gap-2 p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                <span>
                  {tr(
                    "zenReadySummary",
                    "Arunaki Agent is now ready to query real-time store stock, check prices, and process sales orders directly from your chat prompt."
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
          <button
            type="button"
            disabled={guideStep === 1}
            onClick={() => setGuideStep((s) => Math.max(1, s - 1))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium hover:bg-[var(--border-strong)] transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{tr("prevStep", "Previous")}</span>
          </button>

          <span className="text-xs text-[var(--text-muted)] font-mono">
            {guideStep} / 4
          </span>

          {guideStep < 4 ? (
            <button
              type="button"
              onClick={() => setGuideStep((s) => Math.min(4, s + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--text-primary)] text-[var(--bg-app)] text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
            >
              <span>{tr("nextStep", "Next")}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--text-primary)] text-[var(--bg-app)] text-xs font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs"
            >
              <span>{tr("gotItDone", "Got it, Close")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
