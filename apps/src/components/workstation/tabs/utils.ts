export const DOCUMENT_EXTENSIONS = new Set([
  "xlsx", "xls", "xlsm", "docx", "doc", "pptx", "ppt", "csv", "pdf"
]);

export function isDocumentPath(p: string): boolean {
  const ext = (p.split(".").pop() || "").toLowerCase();
  return DOCUMENT_EXTENSIONS.has(ext);
}
