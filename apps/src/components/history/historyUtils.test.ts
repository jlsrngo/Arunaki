import { describe, it, expect } from "vitest";
import { groupSessionsByDate, ChatSession } from "./historyUtils";

describe("historyUtils - groupSessionsByDate", () => {
  it("returns empty array when no sessions exist", () => {
    expect(groupSessionsByDate([])).toEqual([]);
  });

  it("groups today's sessions into Today bucket sorted descending", () => {
    const now = new Date();
    const session1: ChatSession = {
      id: "1",
      title: "First",
      createdAt: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
    };
    const session2: ChatSession = {
      id: "2",
      title: "Second",
      createdAt: new Date(now.getTime() - 1000 * 60 * 10).toISOString(),
    };

    const groups = groupSessionsByDate([session1, session2]);
    expect(groups.length).toBe(1);
    expect(groups[0].group).toBe("Today");
    expect(groups[0].items[0].id).toBe("2"); // Newer first
    expect(groups[0].items[1].id).toBe("1");
  });

  it("categorizes older sessions into appropriate buckets", () => {
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const sessions: ChatSession[] = [
      {
        id: "today",
        title: "Today Session",
        createdAt: new Date(todayDate + 1000).toISOString(),
      },
      {
        id: "yesterday",
        title: "Yesterday Session",
        createdAt: new Date(todayDate - 86400000 + 1000).toISOString(),
      },
      {
        id: "long-ago",
        title: "Old Session",
        createdAt: new Date(todayDate - 100 * 86400000).toISOString(),
      },
    ];

    const groups = groupSessionsByDate(sessions);
    const groupNames = groups.map((g) => g.group);
    expect(groupNames).toContain("Today");
    expect(groupNames).toContain("Yesterday");
    expect(groupNames).toContain("A long time ago");
  });
});
