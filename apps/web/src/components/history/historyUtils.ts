export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  directory?: string;
  messageCount?: number;
  lastMessagePreview?: string;
  isLoadingStats?: boolean;
}

export interface SessionGroup {
  group: string;
  items: ChatSession[];
}

/**
 * Groups chat sessions into Windows Explorer-like chronological date buckets
 */
export function groupSessionsByDate(sessions: ChatSession[]): SessionGroup[] {
  // Sort descending by time so newest sessions are always on top
  const sorted = [...sessions].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || "").getTime() || 0;
    const timeB = new Date(b.updatedAt || b.createdAt || "").getTime() || 0;
    return timeB - timeA;
  });

  const today: ChatSession[] = [];
  const yesterday: ChatSession[] = [];
  const earlierThisWeek: ChatSession[] = [];
  const lastWeek: ChatSession[] = [];
  const lastMonth: ChatSession[] = [];
  const aLongTimeAgo: ChatSession[] = [];

  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Thresholds in ms
  const yesterdayDate = todayDate - 1 * 86400000;
  const earlierThisWeekDate = todayDate - 6 * 86400000;
  const lastWeekDate = todayDate - 13 * 86400000;
  const lastMonthDate = todayDate - 30 * 86400000;

  for (const session of sorted) {
    const time = new Date(session.updatedAt || session.createdAt || "").getTime();
    if (isNaN(time) || time >= todayDate) {
      today.push(session);
    } else if (time >= yesterdayDate) {
      yesterday.push(session);
    } else if (time >= earlierThisWeekDate) {
      earlierThisWeek.push(session);
    } else if (time >= lastWeekDate) {
      lastWeek.push(session);
    } else if (time >= lastMonthDate) {
      lastMonth.push(session);
    } else {
      aLongTimeAgo.push(session);
    }
  }

  const groups: SessionGroup[] = [];
  if (today.length > 0) groups.push({ group: "Today", items: today });
  if (yesterday.length > 0) groups.push({ group: "Yesterday", items: yesterday });
  if (earlierThisWeek.length > 0) groups.push({ group: "Earlier this week", items: earlierThisWeek });
  if (lastWeek.length > 0) groups.push({ group: "Last week", items: lastWeek });
  if (lastMonth.length > 0) groups.push({ group: "Last month", items: lastMonth });
  if (aLongTimeAgo.length > 0) groups.push({ group: "A long time ago", items: aLongTimeAgo });

  return groups;
}
