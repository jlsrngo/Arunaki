/**
 * Helpers for chat attachment normalization, unique deduplication, and media detection.
 */

export function isImageFile(fileName: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith("image/")) return true;
  return /\.(png|jpg|jpeg|webp|gif|svg|bmp)$/i.test(fileName);
}

export function normalizeAttachmentName(
  rawName: string,
  batchIndex: number,
  totalInBatch: number,
  existingCount: number = 0
): string {
  const isGenericImage = /^image(\s*\(\d+\))?\.png$/i.test(rawName.trim());
  if (isGenericImage && (totalInBatch > 1 || existingCount > 0)) {
    const fileNumber = existingCount + batchIndex + 1;
    return `image_${fileNumber}.png`;
  }
  return rawName;
}
