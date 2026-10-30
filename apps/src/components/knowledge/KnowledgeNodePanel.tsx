import { Panel } from '@xyflow/react';
import { X, Save, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Input, Textarea } from '../ui';
import { useKnowledgeNodeDetail } from './hooks/useKnowledgeNodeDetail';

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  type: string;
  active: boolean;
  positionX: number;
  positionY: number;
  nodeColor: string;
  icon: string;
}

interface KnowledgeNodePanelProps {
  nodeId: string | null;
  onClose: () => void;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}

export function KnowledgeNodePanel({ nodeId, onClose, onUpdate, onDelete }: KnowledgeNodePanelProps) {
  const {
    nodeData,
    loading,
    title,
    setTitle,
    urls,
    setUrls,
    city,
    setCity,
    content,
    setContent,
    saving,
    showDeleteConfirm,
    setShowDeleteConfirm,
    isCityDropdownOpen,
    setIsCityDropdownOpen,
    cityDropdownRef,
    filteredCities,
    handleSave,
    handleDelete,
    toggleActive,
    isRulesNode,
  } = useKnowledgeNodeDetail({
    nodeId,
    onClose,
    onUpdate,
    onDelete,
  });

  if (!nodeId || nodeId === 'main-ai-node') return null;

  return (
    <Panel 
      position="top-right" 
      onMouseDown={(e) => e.stopPropagation()} 
      onClick={(e) => e.stopPropagation()} 
      className="max-h-[calc(100vh-8rem)] w-80 mt-4 mr-4 bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-strong)] flex flex-col overflow-hidden pointer-events-auto z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] shrink-0">
        <h3 className="font-bold text-[var(--text-primary)] text-sm">Edit Node</h3>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-[var(--text-muted)] text-sm">Loading node details...</div>
      ) : nodeData ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Status Toggle */}
          <div className="flex items-center justify-between p-3 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)]">
            <div>
              <div className="font-semibold text-xs text-[var(--text-primary)]">AI Knowledge Scope</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {nodeData.active ? 'Active (Included in AI prompt)' : 'Inactive (Excluded from prompt)'}
              </div>
            </div>
            <Button
              type="button"
              variant={nodeData.active ? "default" : "outline"}
              size="sm"
              onClick={toggleActive}
              className="gap-1.5 h-7 text-xs"
            >
              {nodeData.active ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Active
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  Inactive
                </>
              )}
            </Button>
          </div>

          {/* Form fields */}
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">
                {isRulesNode ? 'Operating Context / Rule Title' : 'Title'}
              </label>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Workspace Context"
                className="w-full text-xs font-medium"
              />
            </div>

            {/* Location / City Tagging */}
            <div className="relative" ref={cityDropdownRef}>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">
                Location / City (Optional Tagging)
              </label>
              <Input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setIsCityDropdownOpen(true);
                }}
                onFocus={() => {
                  if (filteredCities.length > 0) setIsCityDropdownOpen(true);
                }}
                placeholder="Type city name..."
                className="w-full text-xs"
              />
              {isCityDropdownOpen && filteredCities.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl shadow-lg z-50 py-1">
                  {filteredCities.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCity(c);
                        setIsCityDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* URLs list */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[var(--text-secondary)] font-medium">Reference URLs</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUrls([...urls, ''])}
                  className="h-auto p-0 text-[10px]"
                >
                  + Add URL
                </Button>
              </div>
              <div className="space-y-1.5">
                {urls.map((u, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <Input
                      type="text"
                      value={u}
                      onChange={(e) => {
                        const next = [...urls];
                        next[i] = e.target.value;
                        setUrls(next);
                      }}
                      placeholder="https://..."
                      className="flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setUrls(urls.filter((_, idx) => idx !== i))}
                      className="text-[var(--text-muted)] hover:text-rose-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Content Field */}
            <div>
              <label className="block text-[var(--text-secondary)] font-medium mb-1">
                Knowledge Instructions & Context
              </label>
              <Textarea
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter system prompt instructions, guidelines, or factual rules here..."
                className="w-full text-xs font-mono"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Footer Actions */}
      <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-between gap-2 shrink-0">
        {showDeleteConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-rose-500 font-semibold">Confirm delete?</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="h-7 text-xs"
            >
              Yes, Delete
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost-destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Delete
          </Button>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-xs"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
