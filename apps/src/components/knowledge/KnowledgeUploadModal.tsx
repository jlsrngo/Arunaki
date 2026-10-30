import React, { useState, useRef, memo } from "react";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { Node, Edge, MarkerType } from "@xyflow/react";
import { cn } from "../../lib/utils";
import { API_BASE, apiFetch } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from "../ui";

interface KnowledgeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newNode: Node, newEdge?: Edge | null) => void;
  onSelectNode: (id: string) => void;
}

export const KnowledgeUploadModal = memo(function KnowledgeUploadModal({
  isOpen,
  onClose,
  onSuccess,
  onSelectNode,
}: KnowledgeUploadModalProps) {
  const [creating, setCreating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extractStep, setExtractStep] = useState<"idle" | "uploading" | "extracting" | "saving" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleClose = () => {
    if (creating) return;
    setSelectedFile(null);
    setExtractStep("idle");
    onClose();
  };

  const createDoc = async () => {
    if (!selectedFile) return;
    setCreating(true);
    setExtractStep("uploading");

    try {
      await new Promise((r) => setTimeout(r, 600));
      setExtractStep("extracting");

      const formData = new FormData();
      formData.append("file", selectedFile);
      // Place new node near center
      formData.append("positionX", "200");
      formData.append("positionY", "200");

      const res = await apiFetch(`${API_BASE}/knowledge/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()).data;

      setExtractStep("saving");
      await new Promise((r) => setTimeout(r, 400));

      // Auto connect to main AI node
      const edgeRes = await apiFetch(`${API_BASE}/knowledge/edges`, {
        method: "POST",
        body: JSON.stringify({
          sourceId: data.id,
          targetId: "main-ai-node",
        }),
      });

      let newEdge: Edge | null = null;
      if (edgeRes.ok) {
        const edgeData = (await edgeRes.json()).data;
        newEdge = {
          id: edgeData.id,
          source: edgeData.sourceId,
          target: edgeData.targetId,
          type: "smoothstep",
          animated: true,
          style: { stroke: "#9ca3af", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#9ca3af" },
        };
      }

      const newNode: Node = {
        id: data.id,
        type: "knowledge",
        position: { x: data.positionX, y: data.positionY },
        data: {
          id: data.id,
          title: data.title,
          content: data.content,
          type: data.type,
          active: data.active,
          nodeColor: "#F59E0B", // amber for uploaded file
          icon: "file-text",
          onSelect: onSelectNode,
        },
      };

      setExtractStep("done");
      await new Promise((r) => setTimeout(r, 800));

      onSuccess(newNode, newEdge);
      handleClose();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
      setExtractStep("idle");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent onClose={creating ? undefined : handleClose} className="max-w-lg p-6 space-y-4">
        {creating ? (
          /* Loading State */
          <div className="py-10 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-[var(--text-primary)] rounded-full animate-spin" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {extractStep === "uploading" && "Uploading file..."}
                {extractStep === "extracting" && "Extracting text from document..."}
                {extractStep === "saving" && "Saving to Knowledge Graph..."}
                {extractStep === "done" && "Saved successfully!"}
              </span>
            </div>

            <div className="space-y-2.5 px-4">
              {(["uploading", "extracting", "saving", "done"] as const).map((step, i) => {
                const steps = ["uploading", "extracting", "saving", "done"] as const;
                const currentIdx = steps.indexOf(extractStep as typeof steps[number]);
                const stepIdx = i;
                const isDone = stepIdx < currentIdx;
                const isCurrent = stepIdx === currentIdx;

                return (
                  <div key={step} className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0",
                        isDone
                          ? "bg-[var(--text-primary)] border-[var(--text-primary)] text-[var(--bg-card)]"
                          : isCurrent
                            ? "border-[#cf6613] text-[#cf6613] bg-[var(--bg-panel)]"
                            : "border-[var(--border-color)] text-[var(--text-dim)] bg-[var(--bg-panel)]"
                      )}
                    >
                      {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isDone ? "text-[var(--text-primary)]" : isCurrent ? "text-[#cf6613]" : "text-[var(--text-dim)]"
                      )}
                    >
                      {step === "uploading" && "Upload file"}
                      {step === "extracting" && "Text extraction"}
                      {step === "saving" && "Create Node & Connections"}
                      {step === "done" && "Complete"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Upload Form */
          <>
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-color)]">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base">Add Document Node</DialogTitle>
                  <DialogDescription>This node will be automatically linked to the AI</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
                dragOver
                  ? "border-[var(--border-strong)] bg-[var(--bg-hover)]"
                  : selectedFile
                    ? "border-[#cf6613] bg-[var(--bg-panel)]"
                    : "border-[var(--border-color)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-panel)]"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              {selectedFile ? (
                <>
                  <FileText className="w-10 h-10 text-[#cf6613] mx-auto mb-3" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedFile.name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="mt-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline cursor-pointer"
                  >
                    Change file
                  </button>
                </>
              ) : (
                <>
                  <UploadCloud className="w-10 h-10 text-[var(--text-dim)] mx-auto mb-3" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Click or drag a document file here</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Supports PDF, DOCX, TXT, Markdown, CSV</p>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="default" onClick={createDoc} disabled={!selectedFile}>
                Upload & Create Node
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
});
