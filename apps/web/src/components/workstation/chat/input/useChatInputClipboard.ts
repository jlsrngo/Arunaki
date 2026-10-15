import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ClipboardEvent,
  type DragEvent,
  type ChangeEvent,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { normalizeAttachmentName, isImageFile } from "../attachmentUtils";
import { AttachedFileItem } from "./types";

interface UseChatInputClipboardOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useChatInputClipboard({ textareaRef }: UseChatInputClipboardOptions) {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleAddImageDataUrl = useCallback(
    (dataUrl: string, nameHint = "screenshot") => {
      const currentCount = attachedFiles.length;
      const rawFileName = `${nameHint}.png`;
      const resolvedName = normalizeAttachmentName(rawFileName, 0, 1, currentCount);
      const timestamp = Date.now();
      const fileId = `${resolvedName}-${timestamp}-${Math.random()}`;

      // Calculate approximate byte size from base64 data URL
      const base64Str = dataUrl.split(",")[1] || "";
      const approxBytes = Math.round((base64Str.length * 3) / 4);

      setAttachedFiles((prev) => [
        ...prev,
        {
          id: fileId,
          name: resolvedName,
          url: dataUrl,
          dataUrl,
          mime: "image/png",
          size: approxBytes,
          isImage: true,
        },
      ]);

      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      if (desktop?.writeFile) {
        const internalAttachmentPath = `.arunaki/attachments/${resolvedName}`;
        desktop.writeFile(internalAttachmentPath, dataUrl).catch((e: any) => {
          console.warn("[useChatInputClipboard] Could not cache attachment internally:", e);
        });
      }
    },
    [attachedFiles.length]
  );

  const handleAddFiles = useCallback(
    async (filesToAdd: File[]) => {
      const currentCount = attachedFiles.length;
      for (let i = 0; i < filesToAdd.length; i++) {
        const file = filesToAdd[i];
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const rawFileName =
            file.name ||
            (file.type ? `screenshot.${file.type.split("/")[1] || "png"}` : "screenshot.png");
          const resolvedName = normalizeAttachmentName(
            rawFileName,
            i,
            filesToAdd.length,
            currentCount
          );
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

          const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
          if (desktop?.writeFile) {
            const internalAttachmentPath = `.arunaki/attachments/${resolvedName}`;
            desktop.writeFile(internalAttachmentPath, dataUrl).catch((e: any) => {
              console.warn("[useChatInputClipboard] Could not cache attachment internally:", e);
            });
          }
        } catch (err) {
          console.warn("[useChatInputClipboard] Failed to read file:", err);
          toast.error(`Failed to read file ${file.name || "attachment"}`);
        }
      }
    },
    [attachedFiles.length]
  );

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    await handleAddFiles(Array.from(selectedFiles));
    e.target.value = "";
  };

  const extractClipboardFiles = (clipboardData?: DataTransfer | null): File[] => {
    if (!clipboardData) return [];
    const fileList: File[] = [];

    // 1. Files from file list (e.g. copied from explorer or standard file drop)
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const f = clipboardData.files[i];
        if (f) fileList.push(f);
      }
    }

    // 2. Items from clipboard data (e.g. pasted screenshots, image data)
    if (fileList.length === 0 && clipboardData.items && clipboardData.items.length > 0) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.kind === "file" || item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            fileList.push(blob);
          }
        }
      }
    }

    return fileList;
  };

  const processPaste = useCallback(
    async (clipboardData?: DataTransfer | null): Promise<boolean> => {
      // 1. First priority: Check desktop native clipboard bridge (Electron Win32 GetClipboardData)
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      if (typeof desktop?.readClipboardImage === "function") {
        try {
          const nativeDataUrl = await desktop.readClipboardImage();
          if (
            nativeDataUrl &&
            typeof nativeDataUrl === "string" &&
            nativeDataUrl.startsWith("data:image/")
          ) {
            handleAddImageDataUrl(nativeDataUrl, "screenshot");
            return true;
          }
        } catch (e) {
          console.warn("[useChatInputClipboard] desktop.readClipboardImage error:", e);
        }
      }

      // 2. Second priority: Standard web clipboard files / items
      const fileList = extractClipboardFiles(clipboardData);
      if (fileList.length > 0) {
        await handleAddFiles(fileList);
        return true;
      }

      // 3. Third priority: Async navigator.clipboard.read() for modern browsers
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.read === "function"
      ) {
        try {
          const clipItems = await navigator.clipboard.read();
          for (const item of clipItems) {
            const imgType = item.types.find((t) => t.startsWith("image/"));
            if (imgType) {
              const blob = await item.getType(imgType);
              const file = new File([blob], `screenshot_${Date.now()}.png`, { type: imgType });
              await handleAddFiles([file]);
              return true;
            }
          }
        } catch {}
      }

      return false;
    },
    [handleAddImageDataUrl, handleAddFiles]
  );

  const handlePaste = async (e: ClipboardEvent<HTMLElement>) => {
    const handled = await processPaste(e.clipboardData);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Window-level paste listener so user can paste a screenshot right after capturing with Snipping Tool
  useEffect(() => {
    const onWindowPaste = async (e: globalThis.ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl !== textareaRef.current &&
        (activeEl.tagName === "INPUT" ||
          (activeEl.tagName === "TEXTAREA" && activeEl !== textareaRef.current))
      ) {
        return;
      }

      const handled = await processPaste(e.clipboardData);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        textareaRef.current?.focus();
      }
    };

    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [processPaste, textareaRef]);

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

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachedFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  return {
    attachedFiles,
    setAttachedFiles,
    fileInputRef,
    handleAddImageDataUrl,
    handleAddFiles,
    handleFileInputChange,
    handlePaste,
    handleDragOver,
    handleDrop,
    handleRemoveFile,
    clearAttachedFiles,
  };
}
