import { Search, X, Trash2, MessageSquare, MessageSquareDashed } from "lucide-react";
import { FilterTab } from "./hooks/useHistorySessions";
import { Button, Input } from "../ui";

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRequestCleanup}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>
              Clean up {emptyCount} empty {emptyCount === 1 ? "session" : "sessions"}
            </span>
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)] pointer-events-none"
          strokeWidth={1.5}
        />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title, prompt snippet, or project folder..."
          className="pl-9 pr-8 py-2.5 bg-[var(--bg-card)]"
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
        <Button
          type="button"
          variant={activeTab === "all" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onTabChange("all")}
        >
          All ({totalCount})
        </Button>
        <Button
          type="button"
          variant={activeTab === "active" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onTabChange("active")}
        >
          <MessageSquare className="w-3 h-3" />
          <span>Active Conversations ({activeCount})</span>
        </Button>
        <Button
          type="button"
          variant={activeTab === "empty" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onTabChange("empty")}
        >
          <MessageSquareDashed className="w-3 h-3" />
          <span>Empty Stubs ({emptyCount})</span>
        </Button>
      </div>
    </div>
  );
}
