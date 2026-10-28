import { memo } from "react";
import { X, FileText } from "lucide-react";
import { getFileIcon } from "../../../workspace/tree-utils";
import { useI18n } from "../../../../lib/i18n";
import { AttachedFileItem, formatFileSize } from "./types";

interface ChatAttachmentChipsProps {
  attachedFiles: AttachedFileItem[];
  onRemoveFile: (index: number) => void;
  onPreviewImage: (url: string) => void;
}

export const ChatAttachmentChips = memo(function ChatAttachmentChips({
  attachedFiles,
  onRemoveFile,
  onPreviewImage,
}: ChatAttachmentChipsProps) {
  const { t } = useI18n();

  if (attachedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2 animate-in fade-in zoom-in-95 duration-150">
      {attachedFiles.map((file, idx) => (
        <div
          key={file.id || idx}
          className="group relative flex items-center gap-2 bg-[var(--bg-hover)] border border-[var(--border-strong)] rounded-xl p-1.5 pr-2.5 shadow-xs"
        >
          {file.isImage ? (
            <img
              src={file.url}
              alt={file.name}
              className="w-10 h-10 rounded-lg object-cover border border-[var(--border-color)] bg-black/20 shrink-0 cursor-pointer"
              onClick={() => onPreviewImage(file.url)}
              title="Click to zoom preview"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center shrink-0 text-[var(--text-muted)]">
              {getFileIcon(file.name) || <FileText className="w-5 h-5" />}
            </div>
          )}
          <div className="flex flex-col min-w-0 max-w-[140px]">
            <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
              {file.name}
            </span>
            <span className="text-[9px] text-[var(--text-dim)] font-mono">
              {file.isImage
                ? t("imageAttached", "Image attached")
                : formatFileSize(file.size) || "File attached"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRemoveFile(idx)}
            className="ml-1 w-4 h-4 rounded-full bg-[var(--bg-panel)] hover:bg-rose-600 hover:text-white text-[var(--text-muted)] flex items-center justify-center transition-colors cursor-pointer"
            title="Remove file"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
});
