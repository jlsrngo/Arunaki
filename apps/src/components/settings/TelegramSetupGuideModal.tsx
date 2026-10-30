import { useState, useEffect } from "react";
import {
  BookOpen,
  ExternalLink,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button } from "../ui";

interface TelegramSetupGuideModalProps {
  isOpen: boolean;
  initialStep?: number;
  onClose: () => void;
}

export function TelegramSetupGuideModal({
  isOpen,
  initialStep = 1,
  onClose,
}: TelegramSetupGuideModalProps) {
  const { t } = useI18n();
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-xl bg-[var(--bg-panel)] p-6 space-y-5">
        {/* Modal Header */}
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div>
              <DialogTitle>
                {t("guideModalTitle", "Telegram Bot Setup Guide")}
              </DialogTitle>
              <DialogDescription className="text-[11px]">
                {t(
                  "guideModalSubtitle",
                  "Connect your Telegram bot in 4 simple steps (takes 2-3 minutes)"
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Stepper Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-app)] rounded-xl border border-[var(--border-color)]">
          {[
            { step: 1, label: t("step1Title", "1. Create Bot") },
            { step: 2, label: t("step2Title", "2. Copy Token") },
            { step: 3, label: t("step3Title", "3. Whitelist ID") },
            { step: 4, label: t("step4Title", "4. Ready") },
          ].map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setGuideStep(s.step)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center",
                guideStep === s.step
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Step Body Content */}
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] min-h-[220px] flex flex-col justify-between">
          {guideStep === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {t("step1Badge", "Step 1 of 4")}
                </span>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  {t("step1Link", "Open @BotFather on Telegram")}{" "}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <h5 className="text-sm font-bold text-[var(--text-primary)]">
                {t("step1Heading", "Create a New Bot via @BotFather")}
              </h5>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step1Desc1",
                  "1. Open Telegram on your phone or desktop, and search for the official bot creator: "
                )}
                <b className="text-[var(--text-primary)]">@BotFather</b>{" "}
                {t("step1Desc1Or", "(or click the link above).")}
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t("step1Desc2", "2. Send the command: ")}{" "}
                <span className="inline-flex items-center gap-1 font-mono bg-[var(--bg-panel)] px-2 py-0.5 rounded text-[var(--text-primary)] border border-[var(--border-strong)]">
                  /newbot
                  <button
                    type="button"
                    onClick={() => handleCopy("/newbot", "newbot")}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    title={t("copyCommand", "Copy command")}
                  >
                    {copiedCode === "newbot" ? (
                      <Check className="w-3 h-3 text-[var(--text-primary)]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </span>
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step1Desc3",
                  "3. Give your bot any display name (e.g. My Document Assistant), then enter a username ending in bot (e.g. arunaki_work_bot)."
                )}
              </p>
            </div>
          )}

          {guideStep === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {t("step2Badge", "Step 2 of 4")}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {t("step2Sub", "API Token")}
                </span>
              </div>
              <h5 className="text-sm font-bold text-[var(--text-primary)]">
                {t("step2Heading", "Copy the HTTP API Token")}
              </h5>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step2Desc1",
                  "After you specify a username, @BotFather will reply with your bot token:"
                )}
              </p>
              <div className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] font-mono text-[11px] text-[var(--text-muted)] space-y-1">
                <p className="text-[10px] text-[var(--text-primary)] font-sans font-semibold">
                  {t("step2Example", "Example message from BotFather:")}
                </p>
                <p className="text-[10px] opacity-75">
                  {t("step2UseToken", "Use this token to access the HTTP API:")}
                </p>
                <p className="text-[var(--text-primary)] font-bold bg-[var(--bg-hover)] p-1 rounded border border-[var(--border-strong)]">
                  7821938210:AAEtvL2_xPQrstUVwXyZ1234
                </p>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step2Desc2",
                  "Copy the entire token string and paste it into the Telegram Bot Token field on the settings page."
                )}
              </p>
            </div>
          )}

          {guideStep === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {t("step3Badge", "Step 3 of 4")}
                </span>
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  {t("step3Link", "Open @userinfobot on Telegram")}{" "}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <h5 className="text-sm font-bold text-[var(--text-primary)]">
                {t("step3Heading", "Whitelist Your Telegram Account (Security)")}
              </h5>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step3DescPrefix",
                  "To make sure only you can control Arunaki on your PC:"
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step3Desc1",
                  "1. Open @userinfobot on Telegram (click the link above)."
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step3Desc2",
                  "2. Send any message or click /start. The bot will reply with your numeric User ID (e.g. 123456789)."
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step3Desc3",
                  "3. Copy this number and paste it into the Allowed Sender Whitelist field."
                )}
              </p>
            </div>
          )}

          {guideStep === 4 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {t("step4Badge", "Final Step")}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-semibold">
                  {t("step4Sub", "Ready to Use!")}
                </span>
              </div>
              <h5 className="text-sm font-bold text-[var(--text-primary)]">
                {t("step4Heading", "Save & Start Messaging")}
              </h5>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step4Desc1",
                  "1. Make sure the toggle switch is ON, then click Save Changes."
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step4Desc2",
                  "2. Open your new bot on Telegram from your phone, and send /start."
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                {t(
                  "step4Desc3",
                  "3. Forward any WhatsApp note or type a document instruction, such as:"
                )}
                <br />
                <span className="font-mono text-[11px] text-[var(--text-primary)] bg-[var(--bg-panel)] px-2 py-1 rounded inline-block mt-1 border border-[var(--border-strong)]">
                  {t(
                    "step4Example",
                    '"rekap catatan penjualan ini ke file rekap.xlsx"'
                  )}
                </span>
              </p>
              <p className="text-[11px] text-[var(--text-primary)] font-semibold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />
                <span>
                  {t(
                    "step4Success",
                    "Arunaki on your PC will automatically process the document and reply back to your phone."
                  )}
                </span>
              </p>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)] mt-3">
            {guideStep > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setGuideStep(guideStep - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />{" "}
                {t("previous", "Previous")}
              </Button>
            ) : (
              <div />
            )}

            {guideStep < 4 ? (
              <Button
                type="button"
                variant="default"
                onClick={() => setGuideStep(guideStep + 1)}
              >
                {t("next", "Next")} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                onClick={onClose}
              >
                {t("doneClose", "Done & Close Guide")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
