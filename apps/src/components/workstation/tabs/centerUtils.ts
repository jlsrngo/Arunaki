import { CenterTab } from "./types";

export const DOCUMENT_EXTENSIONS = new Set([
  "xlsx", "xls", "xlsm", "docx", "doc", "pptx", "ppt", "csv", "pdf"
]);

export function isDocumentPath(p: string): boolean {
  const ext = (p.split(".").pop() || "").toLowerCase();
  return DOCUMENT_EXTENSIONS.has(ext);
}

export function getLanguageMode(activeTab?: CenterTab | null): string {
  if (!activeTab) return "Plain Text";
  if (activeTab.type === "app") {
    if (activeTab.fileType === "wordcraft-app") return "Word Document";
    if (activeTab.fileType === "gridcraft-app") return "Excel Spreadsheet";
    if (activeTab.fileType === "pdfcraft-app") return "PDF Document";
    if (activeTab.fileType === "deckcraft-app") return "PowerPoint Deck";
    return "Document";
  }
  const title = activeTab.title.toLowerCase();
  if (title.endsWith(".txt")) return "Plain Text";
  if (title.endsWith(".md")) return "Markdown";
  if (title.endsWith(".json")) return "JSON";
  if (title.endsWith(".csv")) return "CSV";
  if (/\.(xlsx|xls|xlsm|xlsb)$/i.test(title)) return "Excel Spreadsheet";
  if (/\.(docx|doc|odt|rtf)$/i.test(title)) return "Word Document";
  if (/\.(pptx|ppt|odp)$/i.test(title)) return "PowerPoint Deck";
  if (/\.pdf$/i.test(title)) return "PDF Document";
  return activeTab.title.split(".").pop()?.toUpperCase() || "Plain Text";
}

export function isArtCraftBinaryTab(tab?: CenterTab | null): boolean {
  if (!tab) return false;
  if (
    tab.fileType === "wordcraft-app" ||
    tab.fileType === "gridcraft-app" ||
    tab.fileType === "deckcraft-app"
  ) {
    return true;
  }
  const nameOrPath = `${tab.title || ""} ${tab.path || ""} ${tab.fileType || ""}`.toLowerCase();
  return /\.(docx|doc|odt|rtf|xlsx|xls|xlsm|xlsb|pptx|ppt|odp)(\b|$)/i.test(nameOrPath);
}

