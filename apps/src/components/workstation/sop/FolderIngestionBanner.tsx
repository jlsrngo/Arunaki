import { memo, useState, useEffect, useCallback } from "react";
import { FolderSearch, Play, X, FileText, Loader2 } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { toast } from "sonner";

export interface DetectedDocumentItem {
  filename: string;
  path: string;
  extension: string;
  category: string;
  size_bytes: number;
  detected_at_ms: number;
  recommended_action: string;
  suggested_playbook_id: string;
}

interface FolderIngestionBannerProps {
  activeFolder: string | null;
  onOpenFileTab?: (path: string) => void;
  refetchFiles?: () => void;
}

export const FolderIngestionBanner = memo(function FolderIngestionBanner({
  activeFolder,
  onOpenFileTab,
  refetchFiles,
}: FolderIngestionBannerProps) {
  const [pendingDocs, setPendingDocs] = useState<DetectedDocumentItem[]>([]);
  const [processing, setProcessing] = useState(false);

  const checkFolderWatch = useCallback(async () => {
    if (!activeFolder) {
      setPendingDocs([]);
      return;
    }
    try {
      const response = await apiFetch("/api/desktop/folder-watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_dir: activeFolder,
          detect_all: false,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.pendingDocuments)) {
          setPendingDocs(data.pendingDocuments);
        }
      }
    } catch {
      // Ignore transient network errors during background poll
    }
  }, [activeFolder]);

  useEffect(() => {
    checkFolderWatch();
    const timer = setInterval(checkFolderWatch, 5000);
    return () => clearInterval(timer);
  }, [checkFolderWatch]);

  const handleDismiss = async () => {
    if (!activeFolder) return;
    try {
      await apiFetch("/api/desktop/folder-watch/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_dir: activeFolder }),
      });
      setPendingDocs([]);
    } catch {
      setPendingDocs([]);
    }
  };

  const handleProcessNow = async () => {
    if (!activeFolder || pendingDocs.length === 0) return;
    try {
      setProcessing(true);
      const primaryPlaybook =
        pendingDocs[0]?.suggested_playbook_id || "supplier_invoice_verification";

      toast.info(
        `Ingesting ${pendingDocs.length} newly detected document(s) via SOP (${primaryPlaybook})...`
      );

      const response = await apiFetch("/api/sop/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbook_id: primaryPlaybook,
          workspace_dir: activeFolder,
          session_id: "auto_ingestion_monitor",
          params: {
            cashier_name: "OPERATOR",
            notes: `Auto-ingested ${pendingDocs.map((d) => d.filename).join(", ")}`,
          },
        }),
      });

      if (response.ok) {
        const res = await response.json();
        await handleDismiss();
        refetchFiles?.();
        toast.success(
          `Processed ${pendingDocs.length} new document(s) and updated project ledgers.`
        );
        if (onOpenFileTab && Array.isArray(res?.deliverables) && res.deliverables.length > 0) {
          onOpenFileTab(res.deliverables[res.deliverables.length - 1]);
        }
      } else {
        toast.error("Failed to process newly detected documents.");
      }
    } catch (err: any) {
      toast.error(`Ingestion error: ${err?.message || "Unknown error"}`);
    } finally {
      setProcessing(false);
    }
  };

  if (!activeFolder || pendingDocs.length === 0) {
    return null;
  }

  const uniqueCategories = Array.from(new Set(pendingDocs.map((d) => d.category)));

  return (
    <div className="w-full bg-[var(--bg-elevated)] border-b border-[#cf6613]/40 px-3 py-1.5 flex items-center justify-between gap-3 shrink-0 z-20">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-5 h-5 rounded bg-[#cf6613]/15 border border-[#cf6613]/40 flex items-center justify-center shrink-0">
          <FolderSearch className="w-3.5 h-3.5 text-[#cf6613]" />
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[11px] font-semibold text-white">
            {pendingDocs.length} new administrative document{pendingDocs.length > 1 ? "s" : ""} detected
          </span>
          <div className="flex items-center gap-1">
            {uniqueCategories.slice(0, 3).map((cat) => (
              <span
                key={cat}
                className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-strong)]"
              >
                {cat.replace("_", " ")}
              </span>
            ))}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[320px] hidden sm:inline-flex items-center gap-1">
            <FileText className="w-3 h-3 shrink-0" />
            {pendingDocs.map((d) => d.filename).join(", ")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleProcessNow}
          disabled={processing}
          className="h-6 px-2.5 rounded bg-[#cf6613] hover:bg-[#b8580f] text-white text-[10px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          {processing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
          <span>{processing ? "Processing..." : "Process & Audit Now"}</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={processing}
          className="w-6 h-6 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});
