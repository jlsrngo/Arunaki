import { useState, useEffect, useRef, useMemo } from 'react';
import { Panel } from '@xyflow/react';
import { X, Save, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { apiFetch, API_BASE } from '../../lib/api';
import { subscribeKnowledgeSync } from '../../lib/knowledgeSync';
import { filterLocalLocations, searchRemoteLocations } from './locations';
import { Button, Input, Textarea } from '../ui';

const SYNC_TIME_FORMATTER = new Intl.DateTimeFormat([], {
  hour: '2-digit',
  minute: '2-digit',
});

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
  const [nodeData, setNodeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target as Node)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!nodeId || nodeId === 'main-ai-node') {
      setNodeData(null);
      return;
    }

    const fetchNode = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}`);
        if (res.ok) {
          const { data } = await res.json();
          setNodeData(data);
          setTitle(data.title);

          // Auto-purge any legacy raw CSV dump or internal placeholder
          let cleanContent = data.content || '';
          if (
            cleanContent.startsWith('```csv') ||
            cleanContent.includes('JavaScript tidak diaktifkan') ||
            cleanContent === 'Enter knowledge content here...'
          ) {
            cleanContent = '';
          }
          setContent(cleanContent);

          setCity(data.city || '');
          try {
            const parsed = JSON.parse(data.urls || '[]');
            setUrls(Array.isArray(parsed) ? parsed : []);
          } catch {
            setUrls([]);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchNode();
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId || nodeId === 'main-ai-node') return;
    const unsubscribe = subscribeKnowledgeSync(() => {
      apiFetch(`${API_BASE}/knowledge/${nodeId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json?.data) {
            setNodeData(json.data);
          }
        })
        .catch(() => {});
    });
    return unsubscribe;
  }, [nodeId]);

  const [remoteCities, setRemoteCities] = useState<string[]>([]);

  useEffect(() => {
    const clean = city.trim();
    if (clean.length < 2) {
      setRemoteCities([]);
      return;
    }

    const localMatches = filterLocalLocations(clean, 7);
    if (localMatches.length >= 7) {
      setRemoteCities([]);
      return;
    }

    const abortCtrl = new AbortController();
    const timer = setTimeout(() => {
      searchRemoteLocations(clean, 7, abortCtrl.signal)
        .then((results) => {
          if (!abortCtrl.signal.aborted) {
            setRemoteCities(results);
          }
        })
        .catch(() => {});
    }, 250);

    return () => {
      clearTimeout(timer);
      abortCtrl.abort();
    };
  }, [city]);

  const filteredCities = useMemo(() => {
    if (!city || city.trim().length < 2) return [];
    const localMatches = filterLocalLocations(city, 7);
    if (remoteCities.length > 0) return remoteCities;
    return localMatches;
  }, [city, remoteCities]);

  if (!nodeId || nodeId === 'main-ai-node') return null;

  const handleSave = async () => {
    if (!nodeData) return;
    setSaving(true);
    try {
      let finalContent = content;
      if (
        finalContent.startsWith('```csv') ||
        finalContent.trim() === "Enter knowledge content here..." ||
        finalContent.includes("JavaScript tidak diaktifkan")
      ) {
        finalContent = "";
      }

      const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: finalContent,
          urls: urls.map((u) => u.trim()).filter(Boolean),
          city,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onUpdate(nodeId, data);
        toast.success("Knowledge node saved successfully!");
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error?.message || "Failed to save node");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to save node");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDelete(nodeId);
        onClose();
        toast.success("Knowledge node deleted");
      } else {
        toast.error("Failed to delete node");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to delete node");
    }
  };

  const toggleActive = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const { data } = await res.json();
        setNodeData(data);
        onUpdate(nodeId, data);
        toast.success(data.active ? "Node activated for AI" : "Node deactivated");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to toggle status");
    }
  };

  if (!nodeId || nodeId === 'main-ai-node') {
    return null;
  }

  const isRulesNode = (nodeData?.type || '').toLowerCase() === 'rules';

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
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--border-strong)] border-t-[var(--text-primary)] rounded-full animate-spin" />
        </div>
      ) : nodeData ? (
        <>
          {/* Form */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Status Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)]">
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">Node Status</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Grant access to AI</div>
              </div>
              <Button
                type="button"
                variant={nodeData.active ? "default" : "outline"}
                size="sm"
                onClick={toggleActive}
              >
                {nodeData.active ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Active</>
                ) : (
                  <><XCircle className="w-3.5 h-3.5" /> Inactive</>
                )}
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)]">
                {isRulesNode ? "Rule / SOP Title" : "Knowledge Title"}
              </label>
              <Input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={isRulesNode ? "e.g. Sales Discount Policy" : "e.g. Product Catalog"}
              />
            </div>

            {!isRulesNode && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)]">Spreadsheet / Website URL</label>
                <Input
                  type="url"
                  value={urls[0] || ''}
                  onChange={e => setUrls([e.target.value, ...urls.slice(1)])}
                  placeholder="https://docs.google.com/spreadsheets/d/... or https://example.com"
                />
                
                {urls[0]?.trim() ? (
                  <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] text-[11px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            nodeData?.syncStatus === "failed" ? "bg-[#cf6613]" : "bg-[var(--text-primary)] animate-pulse"
                          )}
                        />
                        <span className="font-medium text-[var(--text-primary)]">
                          {nodeData?.syncStatus === "failed" ? "Sync Warning (Using Cache)" : "Auto-Synced Catalog"}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {nodeData?.lastSyncedAt
                          ? SYNC_TIME_FORMATTER.format(new Date(nodeData.lastSyncedAt))
                          : "Auto-Refresh Active"}
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] leading-tight">
                      Pre-loaded locally in background. AI reads prices & stock instantly without manual refresh.
                    </span>
                  </div>
                ) : (
                  <div className="text-[10px] text-[var(--text-dim)]">
                    Supports Google Sheets & Web Pages (auto-refreshed in background on launch)
                  </div>
                )}

                <div className="relative" ref={cityDropdownRef}>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Location / Branch (Optional)
                  </label>
                  <Input
                    type="text"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setIsCityDropdownOpen(true);
                    }}
                    onFocus={() => setIsCityDropdownOpen(true)}
                    placeholder="e.g. Jakarta, New York, Warehouse B..."
                  />
                  
                  {isCityDropdownOpen && filteredCities.length > 0 && (
                    <div className="absolute left-0 top-full mt-1.5 w-full max-h-40 overflow-y-auto rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] p-1.5 space-y-0.5 z-50 animate-in fade-in duration-100">
                      {filteredCities.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setCity(opt);
                            setIsCityDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          <span className="truncate">{opt}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isRulesNode ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)]">SOP & Business Rules</label>
                <Textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Enter business guidelines, calculation rules, or standard operating procedures..."
                  className="h-44 resize-none"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)]">
                  Instructions for AI <span className="font-normal opacity-70">(Optional)</span>
                </label>
                <Textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="e.g. 'Use wholesale prices for VIP customers', 'Ignore draft rows'..."
                  rows={2}
                  className="h-16 resize-none"
                />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-panel)] shrink-0">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400 font-medium">Delete node?</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    handleDelete();
                  }}
                >
                  Delete
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete Node"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </Button>
          </div>
        </>
      ) : null}
    </Panel>
  );
}
