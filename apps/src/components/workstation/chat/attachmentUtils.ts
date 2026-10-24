/**
 * Helpers for chat attachment normalization, unique deduplication, and media detection.
 */

export function isImageFile(fileName?: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith("image/")) return true;
  return /\.(png|jpg|jpeg|webp|gif|svg|bmp)$/i.test(fileName || "");
}

export function normalizeAttachmentName(
  rawName?: string,
  batchIndex: number = 0,
  totalInBatch: number = 1,
  existingCount: number = 0
): string {
  const safe = (rawName || "").trim();
  const isGenericImage =
    !safe ||
    /^image(\s*\(\d+\))?(\.png)?$/i.test(safe) ||
    safe === "blob" ||
    safe === "screenshot" ||
    safe === "clipboard";

  if (isGenericImage) {
    const fileSuffix = totalInBatch > 1 || existingCount > 0 ? `_${existingCount + batchIndex + 1}` : "";
    const stamp = Date.now().toString().slice(-4);
    return `image_${stamp}${fileSuffix}.png`;
  }
  return safe;
}
