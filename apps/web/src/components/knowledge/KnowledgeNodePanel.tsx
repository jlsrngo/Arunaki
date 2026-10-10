import { useState, useEffect, useRef, useMemo } from 'react';
import { Panel } from '@xyflow/react';
import { X, Save, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { apiFetch, API_BASE } from '../../lib/api';
import { subscribeKnowledgeSync } from '../../lib/knowledgeSync';

/**
 * country-state-city ships 148,038 city names in a 7.69 MB JSON. It was imported at module scope and
 * flattened into ALL_CITIES on load, so the whole thing was parsed on every app start for a
 * suggestion list on one field that is otherwise free text - the value gets saved as typed and is
 * never validated against the list.
 *
 * Loaded on demand instead. The panel is opened rarely, and only someone opening it pays for it.
 */
let citiesPromise: Promise<string[]> | null = null;
function loadCities(): Promise<string[]> {
  citiesPromise ??= import('country-state-city')
    .then((m) => Array.from(new Set(m.City.getAllCities().map((c) => c.name))))
    .catch(() => []); // a missing city list must not break saving the node
  return citiesPromise;
}

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

  const [allCities, setAllCities] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    loadCities().then((list) => {
      if (live) setAllCities(list);
    });
    return () => {
      live = false;
    };
  }, []);

  const filteredCities = useMemo(() => {
    if (!city || city.length < 2 || allCities.length === 0) return [];

    const results = [];
    const query = city.toLowerCase();
    for (let i = 0; i < allCities.length; i++) {
      if (allCities[i].toLowerCase().includes(query)) {
        results.push(allCities[i]);
        if (results.length >= 7) break;
      }
    }
    return results;
  }, [city, allCities]);

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
    if (!confirm('Delete this node?')) return;
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
      className="max-h-[calc(100vh-8rem)] w-80 mt-4 mr-4 bg-[var(--bg-card)] dark:bg-[#141416] text-[var(--text-primary)] rounded-2xl border border-[var(--border-strong)] dark:border-[#2e2e35] flex flex-col overflow-hidden pointer-events-auto shadow-2xl z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] dark:border-[#222226] bg-[var(--bg-panel)] dark:bg-[#18181b] shrink-0">
        <h3 className="font-bold text-[var(--text-primary)] text-sm">Edit Node</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer">
          <X className="w-4 h-4" />
        </button>
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
              <button
                onClick={toggleActive}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                  nodeData.active 
                    ? "bg-[var(--text-primary)] text-[var(--bg-card)] border border-[var(--text-primary)]" 
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]"
                )}
              >
                {nodeData.active ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Active</>
                ) : (
                  <><XCircle className="w-3.5 h-3.5" /> Inactive</>
                )}
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)]">
                {isRulesNode ? "Rule / SOP Title" : "Knowledge Title"}
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={isRulesNode ? "e.g. Sales Discount Policy" : "e.g. Product Catalog"}
                className="w-full px-3 py-2 bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl text-xs focus:outline-none focus:border-[var(--border-strong)]"
              />
            </div>

            {!isRulesNode && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)]">Spreadsheet / Website URL</label>
                <input
                  type="url"
                  value={urls[0] || ''}
                  onChange={e => setUrls([e.target.value, ...urls.slice(1)])}
                  placeholder="https://docs.google.com/spreadsheets/d/... or https://example.com"
                  className="w-full px-3 py-2 bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl text-xs focus:outline-none focus:border-[var(--border-strong)]"
                />
                
                {urls[0]?.trim() ? (
                  <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] text-[11px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            nodeData?.syncStatus === "failed" ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                          )}
                        />
                        <span className="font-medium text-[var(--text-primary)]">
                          {nodeData?.syncStatus === "failed" ? "Sync Warning (Using Cache)" : "Auto-Synced Catalog"}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {nodeData?.lastSyncedAt
                          ? new Date(nodeData.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setIsCityDropdownOpen(true);
                    }}
                    onFocus={() => setIsCityDropdownOpen(true)}
                    placeholder="e.g. Jakarta, New York, Warehouse B..."
                    className="w-full px-3 py-2 bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl text-xs focus:outline-none focus:border-[var(--border-strong)]"
                  />
                  
                  {isCityDropdownOpen && filteredCities.length > 0 && (
                    <div className="absolute left-0 top-full mt-1.5 w-full max-h-40 overflow-y-auto rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl p-1.5 space-y-0.5 z-50 animate-in fade-in duration-100">
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
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Enter business guidelines, calculation rules, or standard operating procedures..."
                  className="w-full h-44 px-3 py-2 bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl text-xs focus:outline-none focus:border-[var(--border-strong)] resize-none"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-muted)]">
                  Instructions for AI <span className="font-normal opacity-70">(Optional)</span>
                </label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="e.g. 'Use wholesale prices for VIP customers', 'Ignore draft rows'..."
                  rows={2}
                  className="w-full h-16 px-3 py-2 bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl text-xs focus:outline-none focus:border-[var(--border-strong)] resize-none"
                />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-panel)] shrink-0">
            <button
              onClick={handleDelete}
              className="p-2 rounded-xl text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Delete Node"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--text-primary)] text-[var(--bg-app)] text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 cursor-pointer transition-opacity"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </>
      ) : null}
    </Panel>
  );
}
