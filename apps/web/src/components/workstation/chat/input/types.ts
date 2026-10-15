export interface AttachedFileItem {
  id: string;
  name: string;
  url: string;
  dataUrl: string;
  mime: string;
  size?: number;
  isImage: boolean;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  tiered: "Tiered",
};

export const effortEffortLabel = (id: string) => {
  const known = EFFORT_LABELS[id.toLowerCase()];
  return known ?? id.charAt(0).toUpperCase() + id.slice(1);
};
