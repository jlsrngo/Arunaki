import {
  useRef,
  useState,
  useMemo,
  useEffect,
  memo,
  type Dispatch,
  type SetStateAction,
  type KeyboardEvent,
  type ClipboardEvent,
  type DragEvent,
  type ChangeEvent,
} from "react";
import {
  Send,
  FileSearch,
  Eraser,
  Clock,
  X,
  ChevronDown,
  Check,
  Plus,
  Flame,
  Square,
  Paperclip,
  FileText,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { ArunakiLogo } from "../../common/ArunakiLogo";
import { getFileIcon } from "../../workspace/tree-utils";
import { normalizeAttachmentName, isImageFile } from "./attachmentUtils";
import { toast } from "sonner";
import { useI18n } from "../../../lib/i18n";

const EFFORT_OPTIONS = [
  { key: "effortDefault", label: "Default", value: "" },
  { key: "effortLow", label: "Low", value: "low" },
  { key: "effortMedium", label: "Medium", value: "medium" },
  { key: "effortHigh", label: "High", value: "high" },
] as const;

export interface AttachedFileItem {
  id: string;
  name: string;
  url: string;
  dataUrl: string;
  mime: string;
  size?: number;
  isImage: boolean;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ChatInputBoxProps {
  files?: { name: string }[];
  isStreaming: boolean;
  onSendMessage: (text: string, files?: Array<{ name: string; uri: string; mime?: string }>) => void;
  onCancelStream?: () => void;
  onSearchSection?: () => void;
  onNewChat?: () => void;
  reasoningEffort?: string;
  setReasoningEffort?: (val: string) => void;
  showThinking?: boolean;
  setShowThinking?: Dispatch<SetStateAction<boolean>>;
  collapseThinking?: boolean;
  setCollapseThinking?: Dispatch<SetStateAction<boolean>>;
  onPreviewImage: (url: string) => void;
}

export const ChatInputBox = memo(function ChatInputBox({
  files = [],
  isStreaming,
  onSendMessage,
  onCancelStream,
  onSearchSection,
  onNewChat,
  reasoningEffort = "",
  setReasoningEffort,
  showThinking,
  setShowThinking,
  setCollapseThinking,
  onPreviewImage,
}: ChatInputBoxProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPrompt, setLocalPrompt] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);

  // Mentions (@) popup
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  // Slash commands (/) popup
  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Reasoning effort dropdown
  const [isEffortDropdownOpen, setIsEffortDropdownOpen] = useState(false);
  const effortDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (effortDropdownRef.current && !effortDropdownRef.current.contains(event.target as Node)) {
        setIsEffortDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentEffortObj = EFFORT_OPTIONS.find((opt) => opt.value === reasoningEffort);
  const currentEffortLabel = currentEffortObj ? t(currentEffortObj.key as any, currentEffortObj.label) : t("effortDefault", "Default");

  const mentionResults = useMemo(() => {
    if (!showMentions) return [];
    const q = mentionQuery.toLowerCase();
    return files
      .map((f) => f.name)
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [showMentions, mentionQuery, files]);

  const availableCommands = useMemo(() => [
    {
      name: "/thinking",
      description: showThinking ? "Collapse thinking" : "Expand thinking",
      icon: ArunakiLogo,
    },
    { name: "/grill-me", description: "Interview requirements deeply before executing", icon: Flame },
    { name: "/new", description: "Start a new conversation session", icon: Plus },
    { name: "/search-section", description: "Search topics across sessions", icon: FileSearch },
    { name: "/clear", description: "Clear current conversation", icon: Eraser },
  ], [showThinking]);

  const filteredCommands = useMemo(() => {
    if (!showCommands) return [];
    const q = commandQuery.toLowerCase();
    return availableCommands.filter((cmd) => cmd.name.toLowerCase().includes(q));
  }, [showCommands, commandQuery, availableCommands]);

  const handleInputChange = (val: string) => {
    setLocalPrompt(val);

    // Fast-path guard: only run regex if text contains '@'
    if (val.includes("@")) {
      const mentionMatch = val.match(/@(\w*)$/);
      if (mentionMatch) {
        setShowMentions(true);
        setMentionQuery(mentionMatch[1] || "");
        setMentionIndex(0);
        if (showCommands) setShowCommands(false);
        return;
      }
    }
    if (showMentions) {
      setShowMentions(false);
    }

    // Fast-path guard: only run regex if text starts with '/'
    if (val.startsWith("/")) {
      const commandMatch = val.match(/^\/([\w-]*)$/);
      if (commandMatch) {
        setShowCommands(true);
        setCommandQuery(commandMatch[1] || "");
        setSelectedCommandIndex(0);
        return;
      }
    }
    if (showCommands) {
      setShowCommands(false);
    }
  };

  const submitPrompt = () => {
    const promptTrimmed = localPrompt.trim();
    if (promptTrimmed === "/thinking") {
      const current = showThinking !== undefined ? showThinking : true;
      const next = !current;
      try {
        localStorage.setItem("arunaki_show_thinking", String(next));
        localStorage.setItem("arunaki_reasoning_effort", next ? "high" : "");
      } catch {}
      setShowThinking?.(next);
      setCollapseThinking?.(!next);
      toast.info(next ? "Thinking expanded" : "Thinking collapsed");
      setLocalPrompt("");
      setAttachedFiles([]);
      return;
    }

    if (!promptTrimmed && attachedFiles.length === 0) return;

    const filesToSend = attachedFiles.map((file) => ({
      name: file.name,
      uri: file.dataUrl,
      mime: file.mime,
    }));

    const finalPrompt =
      promptTrimmed ||
      (attachedFiles.some((f) => f.isImage)
        ? "Please review and analyze this attached image."
        : "Please review and analyze the attached file.");

    onSendMessage(finalPrompt, filesToSend.length > 0 ? filesToSend : undefined);
    setLocalPrompt("");
    setAttachedFiles([]);
  };

  const insertMention = (filename: string) => {
    const updated = localPrompt.replace(/@\w*$/, `@${filename} `);
    setLocalPrompt(updated);
    setShowMentions(false);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleCommandSelect = (cmdName: string) => {
    if (cmdName === "/thinking") {
      setLocalPrompt("");
      setShowCommands(false);
      const current = showThinking !== undefined ? showThinking : true;
      const next = !current;
      try {
        localStorage.setItem("arunaki_show_thinking", String(next));
        localStorage.setItem("arunaki_reasoning_effort", next ? "high" : "");
      } catch {}
      setShowThinking?.(next);
      setCollapseThinking?.(!next);
      toast.info(next ? "Thinking expanded" : "Thinking collapsed");
      return;
    }
    if (cmdName === "/search-section") {
      setLocalPrompt("");
      setShowCommands(false);
      onSearchSection?.();
      return;
    }
    if (cmdName === "/new" || cmdName === "/clear") {
      setLocalPrompt("");
      setShowCommands(false);
      onNewChat?.();
      return;
    }
    setLocalPrompt(`${cmdName} `);
    setShowCommands(false);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowMentions(false);
        return;
      }
    }

    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleCommandSelect(filteredCommands[selectedCommandIndex].name);
        return;
      }
      if (e.key === "Escape") {
        setShowCommands(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleAddFiles = async (filesToAdd: File[]) => {
    const currentCount = attachedFiles.length;
    for (let i = 0; i < filesToAdd.length; i++) {
      const file = filesToAdd[i];
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const resolvedName = normalizeAttachmentName(file.name, i, filesToAdd.length, currentCount);
        const isImg = isImageFile(resolvedName, file.type);
        const localPreviewUrl = isImg ? URL.createObjectURL(file) : "";
        const timestamp = Date.now();
        const fileId = `${resolvedName}-${timestamp}-${Math.random()}`;

        setAttachedFiles((prev) => [
          ...prev,
          {
            id: fileId,
            name: resolvedName,
            url: localPreviewUrl,
            dataUrl,
            mime: file.type || (isImg ? "image/png" : "application/octet-stream"),
            size: file.size,
            isImage: isImg,
          },
        ]);

        // CRITICAL: DO NOT save chat attachments to the root workspace folder!
        // Chat attachments are ephemeral context parts passed in sendPrompt.
        // For non-image documents requiring disk access (xlsx/pdf), save to hidden .arunaki/attachments/
        const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
        if (!isImg && desktop?.writeFile) {
          const internalAttachmentPath = `.arunaki/attachments/${resolvedName}`;
          desktop.writeFile(internalAttachmentPath, dataUrl).catch((e: any) => {
            console.warn("[ChatInputBox] Could not cache non-image attachment internally:", e);
          });
        }
      } catch (err) {
        console.warn("[ChatInputBox] Failed to read file:", err);
        toast.error(`Failed to read file ${file.name}`);
      }
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    await handleAddFiles(Array.from(selectedFiles));
    e.target.value = "";
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const fileList: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) fileList.push(file);
      }
    }
    if (fileList.length > 0) {
      await handleAddFiles(fileList);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative bg-[var(--bg-card)] border border-[var(--border-color)] focus-within:border-[var(--border-strong)] rounded-2xl p-2.5 transition-[border-color] duration-150"
    >
      {/* File Mentions Popup */}
      {showMentions && mentionResults.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl overflow-hidden shadow-2xl transform-gpu will-change-transform">
          <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-hover)] border-b border-[var(--border-color)]">
            {t("selectFileToAttach", "Select file to attach")}
          </div>
          <div className="max-h-44 overflow-y-auto">
            {mentionResults.map((name, i) => (
              <button
                key={name}
                type="button"
                onClick={() => insertMention(name)}
                className={cn(
                  "w-full px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer text-left hover:bg-[var(--bg-hover)]",
                  i === mentionIndex
                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium"
                    : "text-[var(--text-secondary)]"
                )}
              >
                {getFileIcon(name)}
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slash Commands Popup */}
      {showCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl overflow-hidden shadow-2xl transform-gpu will-change-transform">
          <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-hover)] border-b border-[var(--border-color)]">
            {t("slashCommands", "Slash Commands")}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredCommands.map((command, index) => {
              const Icon = command.icon;
              return (
                <button
                  key={command.name}
                  type="button"
                  onClick={() => handleCommandSelect(command.name)}
                  className={cn(
                    "w-full px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--bg-hover)]",
                    index === selectedCommandIndex ? "bg-[var(--bg-hover)] font-medium" : ""
                  )}
                >
                  <Icon size={14} className="text-[var(--text-muted)] shrink-0" strokeWidth={1.5} />
                  <span className="text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0">
                    {command.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-dim)] truncate min-w-0">
                    {command.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Attached Files & Images Preview Chips */}
      {attachedFiles.length > 0 && (
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
                onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="ml-1 w-4 h-4 rounded-full bg-[var(--bg-panel)] hover:bg-red-500/20 hover:text-red-500 text-[var(--text-muted)] flex items-center justify-center transition-colors cursor-pointer"
                title="Remove file"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Zero-JS Auto-Sizing Input Container: CSS Grid Ghost Mirror + Native field-sizing: content */}
      <div className="grid grid-cols-1 relative min-h-[24px] max-h-[160px] overflow-hidden">
        {/* Invisible Ghost Sizer: sizes the grid row purely via browser layout engine with 0 JS */}
        <div
          aria-hidden="true"
          className="col-start-1 row-start-1 invisible whitespace-pre-wrap break-words text-xs leading-[20px] min-h-[24px] max-h-[160px] pointer-events-none select-none py-0.5 overflow-hidden"
        >
          {localPrompt ? localPrompt + "\n" : " "}
        </div>

        {/* Textarea with native Chromium field-sizing: content for 120 FPS C++ auto-expansion */}
        <textarea
          ref={textareaRef}
          value={localPrompt}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={t("askPlaceholder", "Ask anything, type @ to mention files, / for commands...")}
          rows={1}
          style={{ fieldSizing: "content" } as React.CSSProperties}
          className="col-start-1 row-start-1 w-full h-full bg-transparent text-xs leading-[20px] py-0.5 text-[var(--text-primary)] placeholder-[var(--text-dim)] resize-none overflow-y-auto no-scrollbar focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)] mt-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Upload / Attach File Button (First, icon-only) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-5 h-5 rounded-md bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer transition-colors border border-[var(--border-color)] hover:border-[var(--border-strong)] shadow-xs"
            title={t("attachFile", "Attach file or image")}
            aria-label="Attach file"
          >
            <Paperclip className="w-3 h-3" strokeWidth={1.75} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            accept="*/*"
          />

          {setReasoningEffort && (
            <div className="relative" ref={effortDropdownRef}>
              <button
                type="button"
                onClick={() => setIsEffortDropdownOpen(!isEffortDropdownOpen)}
                className="text-[10px] bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-[var(--text-primary)] px-2 py-0.5 rounded-full font-medium border border-[var(--border-color)] hover:border-[var(--border-strong)] flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                title={t("reasoningEffort", "Reasoning Effort")}
              >
                <span>{currentEffortLabel}</span>
                <ChevronDown
                  className={cn(
                    "w-2.5 h-2.5 text-[var(--text-muted)] transition-transform duration-150",
                    isEffortDropdownOpen && "rotate-180"
                  )}
                />
              </button>

              {isEffortDropdownOpen && (
                <div className="absolute bottom-full mb-1.5 left-0 w-28 rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl p-1 space-y-0.5 z-50 animate-in fade-in duration-100">
                  <div className="px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] border-b border-[var(--border-color)] mb-0.5">
                    {t("reasoningEffort", "Reasoning Effort")}
                  </div>
                  {EFFORT_OPTIONS.map((opt) => {
                    const isSelected = reasoningEffort === opt.value;
                    const optLabel = t(opt.key as any, opt.label);
                    return (
                      <button
                        key={opt.value || "natural"}
                        type="button"
                        onClick={() => {
                          setReasoningEffort(opt.value);
                          setIsEffortDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded-lg text-[10px] flex items-center justify-between cursor-pointer transition-colors",
                          isSelected
                            ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        )}
                      >
                        <span>{optLabel}</span>
                        {isSelected && (
                          <Check className="w-2.5 h-2.5 text-[var(--text-primary)] shrink-0 stroke-[2.5]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isStreaming ? (
            <>
              {(localPrompt.trim() || attachedFiles.length > 0) && (
                <button
                  type="button"
                  onClick={submitPrompt}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]"
                  title={t("addToQueue", "Add to queue")}
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onCancelStream}
                className="relative w-7 h-7 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0 group"
                title={t("stopGenerating", "Stop generating")}
              >
                {/* Active spinning border indicator so user clearly sees it is actively processing */}
                <span className="absolute -inset-[1.5px] rounded-full border-2 border-red-400 border-t-transparent animate-spin pointer-events-none" />
                <Square className="w-2.5 h-2.5 fill-white text-white transition-transform group-hover:scale-110" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={submitPrompt}
              disabled={!localPrompt.trim() && attachedFiles.length === 0}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer bg-[var(--text-primary)] hover:opacity-90 disabled:opacity-30 text-[var(--bg-app)]"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
