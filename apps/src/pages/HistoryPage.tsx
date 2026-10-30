import { useState, useCallback } from "react";
import { Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { useHistorySessions } from "../components/history/hooks/useHistorySessions";
import { HistoryFilterBar } from "../components/history/HistoryFilterBar";
import { HistorySessionItem } from "../components/history/HistorySessionItem";
import { EmptySessionModal } from "../components/history/modals/EmptySessionModal";
import { DeleteSessionModal } from "../components/history/modals/DeleteSessionModal";
import { CleanupSessionsModal } from "../components/history/modals/CleanupSessionsModal";
import { Button } from "../components/ui";

const INITIAL_HISTORY_VISIBLE = 20;
const HISTORY_LOAD_STEP = 20;

export function HistoryPage() {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_HISTORY_VISIBLE);
  const {
    loading,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    collapsedGroups,
    toggleGroup,
    emptySessionModal,
    setEmptySessionModal,
    deleteModal,
    setDeleteModal,
    cleanupConfirmModal,
    setCleanupConfirmModal,
    isCleaning,
    handleOpenSession,
    handleDeleteSession,
    handleCleanupEmptySessions,
    totalCount,
    activeCount,
    emptyCount,
    filteredSessions,
    groupedSessions,
  } = useHistorySessions();

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (visibleLimit >= filteredSessions.length) return;
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        setVisibleLimit((prev) => prev + HISTORY_LOAD_STEP);
      }
    },
    [visibleLimit, filteredSessions.length]
  );

  const handleSearchChange = useCallback(
    (q: string) => {
      setSearchQuery(q);
      setVisibleLimit(INITIAL_HISTORY_VISIBLE);
    },
    [setSearchQuery]
  );

  const handleTabChange = useCallback(
    (t: typeof activeTab) => {
      setActiveTab(t);
      setVisibleLimit(INITIAL_HISTORY_VISIBLE);
    },
    [setActiveTab]
  );

  const handleRequestCleanup = useCallback(() => {
    setCleanupConfirmModal(true);
  }, [setCleanupConfirmModal]);

  const handleCloseEmptyModal = useCallback(() => {
    setEmptySessionModal(null);
  }, [setEmptySessionModal]);

  const handleOpenAnyway = useCallback(
    (sess: Parameters<typeof handleOpenSession>[0]) => {
      handleOpenSession(sess, true);
    },
    [handleOpenSession]
  );

  const handleCloseDeleteModal = useCallback(() => {
    setDeleteModal(null);
  }, [setDeleteModal]);

  const handleCloseCleanupModal = useCallback(() => {
    setCleanupConfirmModal(false);
  }, [setCleanupConfirmModal]);

  let renderedCount = 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden select-none transition-colors duration-150">
      <HistoryFilterBar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        totalCount={totalCount}
        activeCount={activeCount}
        emptyCount={emptyCount}
        onRequestCleanup={handleRequestCleanup}
      />

      {/* Scrollable History List */}
      <div
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto px-8 pb-8"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-muted)] gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading history...</span>
          </div>
        ) : groupedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mb-3 border border-[var(--border-color)]">
              <Sparkles className="w-5 h-5 text-[var(--text-muted)]" strokeWidth={1.5} />
            </div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-1">
              {searchQuery ? "No matching conversations found" : "No Chat History Yet"}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] max-w-[280px]">
              {searchQuery
                ? "Try searching with a different keyword or reset your filter."
                : "Your conversations and project folder sessions will appear here automatically."}
            </p>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {groupedSessions.map((group) => {
              if (renderedCount >= visibleLimit) return null;
              const remainingBudget = Math.max(0, visibleLimit - renderedCount);
              const visibleItems = group.items.slice(0, remainingBudget);
              renderedCount += visibleItems.length;
              const isCollapsed = collapsedGroups[group.group];
              return (
                <div key={group.group} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.group)}
                    className="flex items-center gap-1.5 px-1 cursor-pointer group/header w-full text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover/header:text-[var(--text-primary)] transition-colors" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover/header:text-[var(--text-primary)] transition-colors" />
                    )}
                    <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-wide">
                      {group.group}
                    </h2>
                    <span className="text-[11px] text-[var(--text-dim)] font-mono ml-1">
                      ({group.items.length})
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-1.5">
                      {visibleItems.map((session) => (
                        <HistorySessionItem
                          key={session.id}
                          session={session}
                          onSelect={handleOpenSession}
                          onDelete={setDeleteModal}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredSessions.length > visibleLimit && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleLimit((prev) => prev + HISTORY_LOAD_STEP)}
                  className="rounded-full"
                >
                  Load more sessions ({filteredSessions.length - visibleLimit} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <EmptySessionModal
        session={emptySessionModal}
        onClose={handleCloseEmptyModal}
        onDelete={handleDeleteSession}
        onOpenAnyway={handleOpenAnyway}
      />

      <DeleteSessionModal
        session={deleteModal}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDeleteSession}
      />

      <CleanupSessionsModal
        isOpen={cleanupConfirmModal}
        emptyCount={emptyCount}
        isCleaning={isCleaning}
        onClose={handleCloseCleanupModal}
        onConfirm={handleCleanupEmptySessions}
      />
    </div>
  );
}

export default HistoryPage;
