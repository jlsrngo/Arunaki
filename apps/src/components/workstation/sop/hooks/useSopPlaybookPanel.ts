import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { apiFetch } from "../../../../lib/api";
import { SopPlaybookDef, getWorkspaceFolderBasename } from "../sopTypes";

export function useSopPlaybookPanel(activeFolder: string | null) {
  const [playbooks, setPlaybooks] = useState<SopPlaybookDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isRootExpanded, setIsRootExpanded] = useState(true);
  const [isStudiosExpanded, setIsStudiosExpanded] = useState(true);

  const folderName = useMemo(
    () => getWorkspaceFolderBasename(activeFolder),
    [activeFolder]
  );

  const toggleRootExpanded = useCallback(() => {
    setIsRootExpanded((v) => !v);
  }, []);

  const toggleStudiosExpanded = useCallback(() => {
    setIsStudiosExpanded((v) => !v);
  }, []);

  const openPlaybookInCenter = useCallback((pb: SopPlaybookDef) => {
    setSelectedId(pb.id);
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook",
          title: pb.title,
          path: pb.id,
          content: JSON.stringify(pb),
        },
      })
    );
  }, []);

  const openNewPlaybookInCenter = useCallback(() => {
    setSelectedId("__new__");
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook-new",
          title: "New Playbook",
          path: "new",
          content: "",
        },
      })
    );
  }, []);

  const openReconcileInCenter = useCallback(() => {
    setSelectedId("__reconcile__");
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook-audit",
          title: "3-Way Reconciliation Audit",
          path: "reconcile",
          content: "",
        },
      })
    );
  }, []);

  const openExecutiveInCenter = useCallback(() => {
    setSelectedId("__executive__");
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook-exec",
          title: "Executive Brief Synthesis",
          path: "executive",
          content: "",
        },
      })
    );
  }, []);

  const fetchPlaybooks = useCallback(async () => {
    if (!activeFolder) {
      setPlaybooks([]);
      return;
    }
    try {
      setLoading(true);
      const response = await apiFetch("/api/sop/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_dir: activeFolder }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.playbooks)) {
          setPlaybooks(data.playbooks);
        }
      }
    } catch {
      // Keep current list on transient error
    } finally {
      setLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => {
    void fetchPlaybooks();
  }, [fetchPlaybooks]);

  useEffect(() => {
    const handleUpdated = () => {
      void fetchPlaybooks();
    };
    window.addEventListener("arunaki:playbooks-updated", handleUpdated);
    return () => {
      window.removeEventListener("arunaki:playbooks-updated", handleUpdated);
    };
  }, [fetchPlaybooks]);

  const handleGenerateFromFolder = useCallback(async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setGenerating(true);
      toast.info("Scanning workspace documents to build SOP Playbooks...");
      const response = await apiFetch("/api/sop/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_dir: activeFolder }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.playbooks)) {
          setPlaybooks(data.playbooks);
          if (data.playbooks.length > 0) {
            openPlaybookInCenter(data.playbooks[0]);
          }
          toast.success(
            `Generated ${data.playbooks.length} playbook(s) from your folder.`
          );
        }
      } else {
        toast.error("Failed to generate playbooks from folder.");
      }
    } catch (err: any) {
      toast.error(`Generation error: ${err?.message || "Unknown error"}`);
    } finally {
      setGenerating(false);
    }
  }, [activeFolder, openPlaybookInCenter]);

  return {
    playbooks,
    selectedId,
    loading,
    generating,
    isRootExpanded,
    isStudiosExpanded,
    folderName,
    toggleRootExpanded,
    toggleStudiosExpanded,
    openPlaybookInCenter,
    openNewPlaybookInCenter,
    openReconcileInCenter,
    openExecutiveInCenter,
    fetchPlaybooks,
    handleGenerateFromFolder,
  };
}

