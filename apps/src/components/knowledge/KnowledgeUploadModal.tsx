import React, { useState, useRef, memo } from "react";
import { UploadCloud, FileText, CheckCircle2, X } from "lucide-react";
import { Node, Edge, MarkerType } from "@xyflow/react";
import { cn } from "../../lib/utils";
import { API_BASE, apiFetch } from "../../lib/api";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[var(--bg-card)] text-[var(--text-primary)] rounded-3xl p-6 space-y-5 border border-[var(--border-color)]">
        {creating ? (
          /* Loading State */
          <div className="py-10 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              <span className="text-sm font-semibold text-gray-900">
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
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : isCurrent
                            ? "border-gray-900 text-gray-900 bg-gray-50"
                            : "border-gray-200 text-gray-400 bg-gray-50"
                      )}
                    >
                      {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isDone ? "text-emerald-600" : isCurrent ? "text-gray-900" : "text-gray-400"
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gray-100 text-gray-700">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Add Document Node</h3>
                  <p className="text-xs text-gray-500">This node will be automatically linked to the AI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
                  ? "border-gray-900 bg-gray-50"
                  : selectedFile
                    ? "border-emerald-300 bg-emerald-50/50"
                    : "border-gray-200 hover:border-gray-400 hover:bg-gray-50/50"
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
                  <FileText className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-900">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline cursor-pointer"
                  >
                    Change file
                  </button>
                </>
              ) : (
                <>
                  <UploadCloud className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700">Click or drag a document file here</p>
                  <p className="text-xs text-gray-400 mt-1">Supports PDF, DOCX, TXT, Markdown, CSV</p>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createDoc}
                disabled={!selectedFile}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-all cursor-pointer",
                  !selectedFile && "opacity-50 cursor-not-allowed"
                )}
              >
                Upload & Create Node
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
