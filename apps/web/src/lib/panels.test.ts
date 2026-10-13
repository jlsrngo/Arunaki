import { describe, it, expect, beforeEach } from "vitest";
import { getPanels, setPanel, togglePanel } from "./panels";

describe("panels", () => {
  beforeEach(() => {
    setPanel("explorer", true);
    setPanel("chat", true);
  });

  it("toggles one panel without touching the other", () => {
    togglePanel("explorer");
    expect(getPanels()).toEqual({ explorerOpen: false, chatOpen: true });

    togglePanel("explorer");
    expect(getPanels()).toEqual({ explorerOpen: true, chatOpen: true });
  });

  it("toggles chat independently", () => {
    togglePanel("chat");
    expect(getPanels()).toEqual({ explorerOpen: true, chatOpen: false });
  });

  it("keeps the same snapshot when the value does not change", () => {
    // useSyncExternalStore compares snapshots by identity: returning a new object for an
    // unchanged value would re-render every subscriber on every no-op write.
    const before = getPanels();
    setPanel("explorer", before.explorerOpen);
    expect(getPanels()).toBe(before);
  });

  it("returns a new snapshot on a real change", () => {
    const before = getPanels();
    setPanel("chat", false);
    expect(getPanels()).not.toBe(before);
    expect(getPanels().chatOpen).toBe(false);
  });
});