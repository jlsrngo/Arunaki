export interface SopStepDef {
  step_index: number;
  title: string;
  description: string;
  target_file: string;
  app: string;
}

export interface SopPlaybookDef {
  id: string;
  title: string;
  category: string;
  description: string;
  estimated_minutes: number;
  steps: SopStepDef[];
}

export interface EditablePlaybookStep {
  title: string;
  description: string;
  target_file: string;
}

export interface ReconcileAnomaly {
  code: string;
  severity: string;
  title: string;
  description: string;
  variance_amount: number;
  recommendation: string;
}

export interface ReconcileLineItem {
  reference_id: string;
  description: string;
  source_a: number;
  source_b: number;
  source_c: number;
  variance: number;
  status: string;
}

export interface ReconcileAuditResult {
  status: string;
  audit_status: "BALANCED" | "DISCREPANCY_DETECTED";
  mode: string;
  period: string;
  labels: {
    source_a: string;
    source_b: string;
    source_c: string;
  };
  totals: {
    source_a: number;
    source_b: number;
    source_c: number;
    net_variance: number;
    absolute_variance: number;
  };
  matched_count: number;
  mismatch_count: number;
  anomalies_count: number;
  anomalies: ReconcileAnomaly[];
  line_items: ReconcileLineItem[];
  deliverables: string[];
}

export interface ExecutiveKpiResult {
  period: string;
  prepared_by: string;
  gross_revenue: number;
  operating_expenses: number;
  net_operating_income: number;
  operating_margin_pct: number;
  accounts_payable_total: number;
  top_revenue_channel: string;
  top_cost_driver: string;
  audit_health_status: string;
  highlights: string[];
  recommendations: string[];
}

export type SopCenterMode = "playbook" | "new-playbook" | "reconcile" | "executive";
export type ReconcileAuditMode = "cash_and_bank" | "procurement_three_way";

export const IDR_NUMBER_FORMATTER = new Intl.NumberFormat("id-ID");

export const DEFAULT_PLAYBOOK_STEPS: EditablePlaybookStep[] = [
  {
    title: "Read & Parse Source Document",
    description: "Extract daily records or notes from source file.",
    target_file: "LAPORAN-HARIAN.txt",
  },
  {
    title: "Recap Data into Spreadsheet",
    description: "Update columns and recalculate totals in GridCraft.",
    target_file: "recap_summary.xlsx",
  },
];

