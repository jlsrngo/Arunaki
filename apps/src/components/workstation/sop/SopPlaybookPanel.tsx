import { memo } from "react";
import { useI18n } from "../../../lib/i18n";
import { useSopPlaybookPanel } from "./hooks/useSopPlaybookPanel";
import { SopPlaybookHeader } from "./components/SopPlaybookHeader";
import { SopPlaybookListItem } from "./components/SopPlaybookListItem";
import { SopPlaybookFooterTools } from "./components/SopPlaybookFooterTools";
import type {
  SopStepDef,
  SopPlaybookDef,
  ReconcileAnomaly,
  ReconcileLineItem,
  ReconcileAuditResult,
  ExecutiveKpiResult,
} from "./sopTypes";

export type {
  SopStepDef,
  SopPlaybookDef,
  ReconcileAnomaly,
  ReconcileLineItem,
  ReconcileAuditResult,
  ExecutiveKpiResult,
};

interface SopPlaybookPanelProps {
  activeFolder: string | null;
  onOpenFileTab?: (path: string) => void;
  refetchFiles?: () => void;
  onClose?: () => void;
  width?: string;
}

/**
 * SopPlaybookPanel
 *
 * Clean, modular orchestrator for the Left Panel SOP Playbooks explorer
 * and Audit & Executive quick-launch tools.
 */
export const SopPlaybookPanel = memo(function SopPlaybookPanel({
  activeFolder,
  onClose,
  width = "var(--left-panel-width)",
}: SopPlaybookPanelProps) {
  const { t } = useI18n();
  const {
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
  } = useSopPlaybookPanel(activeFolder);

  return (
    <aside
      style={{ width }}
      className="bg-[var(--bg-panel)] text-[var(--text-primary)] border-r border-[var(--border-color)] flex flex-col shrink-0 select-none overflow-hidden transition-colors duration-150"
    >
      <SopPlaybookHeader
        title={t("sopPlaybooks", "Playbooks")}
        folderName={folderName}
        hasActiveFolder={Boolean(activeFolder)}
        loading={loading}
        generating={generating}
        isRootExpanded={isRootExpanded}
        onToggleRootExpanded={toggleRootExpanded}
        onRefresh={fetchPlaybooks}
        onGenerateFromFolder={handleGenerateFromFolder}
        onAddNewPlaybook={openNewPlaybookInCenter}
        onClose={onClose}
      />

      <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-1 space-y-0.5">
        {isRootExpanded &&
          playbooks.map((pb) => (
            <SopPlaybookListItem
              key={pb.id}
              playbook={pb}
              isSelected={selectedId === pb.id}
              onSelect={openPlaybookInCenter}
            />
          ))}
      </div>

      <SopPlaybookFooterTools
        selectedId={selectedId}
        isExpanded={isStudiosExpanded}
        onToggleExpanded={toggleStudiosExpanded}
        onOpenReconcile={openReconcileInCenter}
        onOpenExecutive={openExecutiveInCenter}
      />
    </aside>
  );
});
