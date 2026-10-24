import { memo, useState, useEffect, useMemo, useCallback } from "react";
import {
  Keyboard,
  Search,
  RotateCcw,
  X,
  Pencil,
} from "lucide-react";
import {
  DEFAULT_SHORTCUTS,
  ShortcutDefinition,
  getCustomShortcuts,
  saveCustomShortcut,
  resetCustomShortcut,
  resetAllShortcuts,
  parseEventToShortcut,
} from "./shortcutsConfig";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string>>({});

  // Synchronize local state with localStorage
  const refreshCustomShortcuts = useCallback(() => {
    setCustomShortcuts(getCustomShortcuts());
  }, []);

  useEffect(() => {
    refreshCustomShortcuts();
    const handleUpdate = () => refreshCustomShortcuts();
    window.addEventListener("arunaki-shortcuts-updated", handleUpdate);
    return () => window.removeEventListener("arunaki-shortcuts-updated", handleUpdate);
  }, [refreshCustomShortcuts]);

  // Global keydown capture while recording a shortcut
  useEffect(() => {
    if (!editingId) return;
    const currentId = editingId;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setEditingId(null);
        return;
      }

      const combo = parseEventToShortcut(e);
      if (!combo) {
        return;
      }

      saveCustomShortcut(currentId, combo);
      const target = DEFAULT_SHORTCUTS.find((s) => s.id === currentId);
      toast.success(`Shortcut updated for "${target?.desc || currentId}": ${combo}`);
      setEditingId(null);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [editingId]);

  const handleResetSingle = (id: string, desc: string) => {
    resetCustomShortcut(id);
    toast.info(`Reset shortcut for "${desc}" to default`);
  };

  const handleResetAll = () => {
    resetAllShortcuts();
    toast.info("All keyboard shortcuts have been reset to default");
  };

  // Filtered shortcuts
  const filteredShortcuts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return DEFAULT_SHORTCUTS;
    return DEFAULT_SHORTCUTS.filter((s) => {
      const activeKey = customShortcuts[s.id] || s.defaultKey;
      return (
        s.desc.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        activeKey.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, customShortcuts]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, ShortcutDefinition[]>();
    filteredShortcuts.forEach((item) => {
      if (!map.has(item.category)) {
        map.set(item.category, []);
      }
      map.get(item.category)!.push(item);
    });
    return Array.from(map.entries());
  }, [filteredShortcuts]);

  const hasAnyCustom = Object.keys(customShortcuts).length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 sm:p-6 animate-in fade-in duration-100 select-none">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-w-3xl w-full p-5 sm:p-6 flex flex-col gap-4 text-xs">
        {/* Header (Monochrome) */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] flex items-center justify-center border border-[var(--border-strong)]">
              <Keyboard className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--text-primary)]">
                {t("keyboardShortcuts", "Keyboard Shortcuts")}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Click any shortcut badge to reassign key combination.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Actions Bar (Monochrome) */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchShortcuts", "Search shortcuts...")}
              className="w-full bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
            />
          </div>
          {hasAnyCustom && (
            <button
              type="button"
              onClick={handleResetAll}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl border border-[var(--border-color)] transition-colors text-[11px] font-medium cursor-pointer shrink-0"
              title="Reset all modified shortcuts to default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t("resetAllShortcuts", "Reset All")}</span>
            </button>
          )}
        </div>

        {/* 2-Column Grid for wider, non-elongated layout & optimized scrolling */}
        <div className="max-h-[460px] overflow-y-auto overscroll-contain pr-1 space-y-3.5">
          {grouped.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              No shortcuts found matching &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
              {grouped.map(([category, items]) => (
                <div key={category} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] px-1">
                    {category}
                  </div>
                  <div className="bg-[var(--bg-hover)]/30 rounded-xl p-1.5 border border-[var(--border-color)] divide-y divide-[var(--border-color)]/30">
                    {items.map((item) => {
                      const isCustom = Boolean(customShortcuts[item.id]);
                      const currentCombo = customShortcuts[item.id] || item.defaultKey;
                      const isRecording = editingId === item.id;

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center justify-between py-2 px-2.5 rounded-lg transition-colors",
                            isRecording
                              ? "bg-[var(--bg-hover)] ring-1 ring-[var(--border-strong)]"
                              : "hover:bg-[var(--bg-hover)]/60"
                          )}
                        >
                          <div className="flex items-center gap-2 mr-2 min-w-0">
                            <span className="text-[var(--text-primary)] text-xs truncate">
                              {item.desc}
                            </span>
                            {isCustom && !isRecording && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-strong)] shrink-0 font-medium">
                                Edited
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isRecording ? (
                              <div className="flex items-center gap-1.5 bg-[var(--text-primary)]/10 text-[var(--text-primary)] border border-[var(--text-primary)]/40 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium animate-pulse">
                                <span>Press keys...</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingId(item.id)}
                                className={cn(
                                  "group/btn flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-card)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer shadow-2xs",
                                  isCustom && "border-[var(--border-strong)] text-[var(--text-primary)] font-semibold"
                                )}
                                title="Click to reassign this shortcut"
                              >
                                <span>{currentCombo}</span>
                                <Pencil className="w-2.5 h-2.5 text-[var(--text-muted)] group-hover/btn:text-[var(--text-primary)] opacity-40 group-hover/btn:opacity-100 transition-opacity" strokeWidth={2} />
                              </button>
                            )}

                            {isCustom && !isRecording && (
                              <button
                                type="button"
                                onClick={() => handleResetSingle(item.id, item.desc)}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                                title="Reset to default shortcut"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer (Monochrome) */}
        <div className="flex justify-between items-center pt-2.5 border-t border-[var(--border-color)]">
          <div className="text-[11px] text-[var(--text-muted)]">
            {editingId ? (
              <span className="text-[var(--text-primary)] font-medium">Recording shortcut... Press Escape to cancel</span>
            ) : (
              <span>Click any shortcut keycap to rebind. Saved automatically.</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-[var(--text-primary)] font-medium rounded-lg text-xs transition-colors cursor-pointer border border-[var(--border-strong)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
});
