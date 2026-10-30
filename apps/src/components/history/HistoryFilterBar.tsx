import { Search, X, Trash2, MessageSquare, MessageSquareDashed } from "lucide-react";
import { FilterTab } from "./hooks/useHistorySessions";

interface HistoryFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  totalCount: number;
  activeCount: number;
  emptyCount: number;
  onRequestCleanup: () => void;
}

export function HistoryFilterBar({
  searchQuery,
  onSearchChange,
  activeTab,
  onTabChange,
  totalCount,
  activeCount,
  emptyCount,
  onRequestCleanup,
}: HistoryFilterBarProps) {
  return (
    <div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-4 shrink-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            Chat History
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            View, resume, or clean up previous conversations and sessions
          </p>
        </div>

        {/* Batch Clean Up Button for Empty Sessions */}
        {emptyCount > 0 && (
          <button
            type="button"
            onClick={onRequestCleanup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] hover:border-[var(--border-strong)] transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>
              Clean up {emptyCount} empty {emptyCount === 1 ? "session" : "sessions"}
            </span>
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
          strokeWidth={1.5}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title, prompt snippet, or project folder..."
          className="w-full pl-9 pr-3.5 py-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] font-sans transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onTabChange("all")}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
            activeTab === "all"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
              : "bg-transparent text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-hover)]/50"
          }`}
        >
          All ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => onTabChange("active")}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border flex items-center gap-1.5 ${
            activeTab === "active"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
              : "bg-transparent text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-hover)]/50"
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          <span>Active Conversations ({activeCount})</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange("empty")}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border flex items-center gap-1.5 ${
            activeTab === "empty"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
              : "bg-transparent text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-hover)]/50"
          }`}
        >
          <MessageSquareDashed className="w-3 h-3" />
          <span>Empty Stubs ({emptyCount})</span>
        </button>
      </div>
    </div>
  );
}
