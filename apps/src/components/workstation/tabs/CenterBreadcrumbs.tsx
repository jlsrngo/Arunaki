import { memo, useState, useEffect, useCallback } from "react";
import { ChevronRight, ShieldCheck, Lock, Unlock, Stamp } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { toast } from "sonner";

interface CenterBreadcrumbsProps {
  folderName: string;
  tabTitle: string;
  appName?: string;
  activeFolder?: string;
}

interface GovernanceRecord {
  filename: string;
  status: "DRAFT" | "UNDER_REVIEW" | "VERIFIED" | "FINAL_LOCKED";
  reviewer: string;
  stamp_id?: string | null;
  sha256_hash: string;
  locked: boolean;
}

export const CenterBreadcrumbs = memo(function CenterBreadcrumbs({
  folderName,
  tabTitle,
  appName,
  activeFolder,
}: CenterBreadcrumbsProps) {
  const showAppCrumb = appName && appName.toLowerCase() !== tabTitle.toLowerCase();
  const [record, setRecord] = useState<GovernanceRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const isGovernableFile =
    Boolean(activeFolder) &&
    /\.(docx|doc|xlsx|xls|csv|pptx|pdf|md|txt)$/i.test(tabTitle);

  const fetchGovernanceStatus = useCallback(async () => {
    if (!activeFolder || !isGovernableFile) {
      setRecord(null);
      return;
    }
    try {
      const res = await apiFetch("/api/governance/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          workspace_dir: activeFolder,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const found = data?.manifest?.[tabTitle] || null;
        setRecord(found);
      }
    } catch {
      // Ignore background fetch error
    }
  }, [activeFolder, tabTitle, isGovernableFile]);

  useEffect(() => {
    fetchGovernanceStatus();
  }, [fetchGovernanceStatus]);

  const handleUpdateGovernance = async (
    nextStatus: "DRAFT" | "UNDER_REVIEW" | "VERIFIED" | "FINAL_LOCKED",
    applyStamp: boolean
  ) => {
    if (!activeFolder || busy) return;
    try {
      setBusy(true);
      const res = await apiFetch("/api/governance/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          workspace_dir: activeFolder,
          filename: tabTitle,
          status: nextStatus,
          apply_stamp: applyStamp,
          reviewer: "Arunaki Administration Manager",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.record) {
          setRecord(data.record);
          toast.success(
            `Governance Updated: ${tabTitle} is now ${nextStatus.replace("_", " ")}`
          );
        }
      }
    } catch (err: any) {
      toast.error(`Governance update failed: ${err?.message || "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  const currentStatus = record?.status || "DRAFT";
  const isLocked = record?.locked || currentStatus === "FINAL_LOCKED";

  return (
    <div className="h-[26px] bg-[var(--bg-panel)] border-b border-[var(--border-color)] px-4 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] select-none shrink-0 font-sans transition-colors">
      <div className="flex items-center gap-1.5 min-w-0 truncate">
        <span className="truncate">{folderName}</span>
        <ChevronRight className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
        {showAppCrumb && (
          <>
            <span className="text-[var(--text-muted)] shrink-0">{appName}</span>
            <ChevronRight className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
          </>
        )}
        <span className="text-[var(--text-primary)] font-medium truncate">
          {tabTitle}
        </span>
      </div>

      {isGovernableFile && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            title={
              record?.stamp_id
                ? `Stamp: ${record.stamp_id} | SHA-256: ${record.sha256_hash.slice(0, 12)}...`
                : "Document Lifecycle Governance Status"
            }
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider flex items-center gap-1 border",
              isLocked
                ? "bg-[#cf6613]/20 text-[#cf6613] border-[#cf6613]/50 font-bold"
                : currentStatus === "VERIFIED"
                ? "bg-[var(--bg-hover)] text-white border-[var(--border-strong)] font-semibold"
                : "bg-[var(--bg-app)] text-[var(--text-dim)] border-[var(--border-color)]"
            )}
          >
            {isLocked ? (
              <Lock className="w-2.5 h-2.5" />
            ) : (
              <ShieldCheck className="w-2.5 h-2.5" />
            )}
            <span>{currentStatus.replace("_", " ")}</span>
          </span>

          {currentStatus !== "VERIFIED" && !isLocked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleUpdateGovernance("VERIFIED", true)}
              className="h-4.5 px-1.5 rounded bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-white text-[9px] font-medium flex items-center gap-1 border border-[var(--border-strong)] transition-colors cursor-pointer"
              title="Apply Official Digital Approval Stamp & Mark Verified"
            >
              <Stamp className="w-2.5 h-2.5 text-[#cf6613]" />
              <span>Stamp & Verify</span>
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              handleUpdateGovernance(
                isLocked ? "VERIFIED" : "FINAL_LOCKED",
                !isLocked
              )
            }
            className={cn(
              "h-4.5 px-1.5 rounded text-[9px] font-medium flex items-center gap-1 border transition-colors cursor-pointer",
              isLocked
                ? "bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-white border-[var(--border-strong)]"
                : "bg-[#cf6613] hover:bg-[#b8580f] text-white border-[#cf6613]"
            )}
            title={
              isLocked
                ? "Unlock document to allow editing"
                : "Finalize and lock document as Read-Only"
            }
          >
            {isLocked ? (
              <>
                <Unlock className="w-2.5 h-2.5" />
                <span>Unlock</span>
              </>
            ) : (
              <>
                <Lock className="w-2.5 h-2.5" />
                <span>Lock Final</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
});
