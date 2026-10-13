import { useSyncExternalStore } from "react";

/**
 * Explorer and chat panel visibility, shared by UnifiedWorkstationPage (which renders the
 * panels) and the View menu (which has to report whether each one is open).
 *
 * This was plain useState inside the page, so the menu could fire a toggle event but could never
 * know the outcome - Wrap Text, the three themes and the two languages all showed a checkmark,
 * the two panels never did. Mirrors lib/wordWrap.ts, minus the persistence: panel layout is per
 * session and should not outlive it.
 */

export type PanelName = "explorer" | "chat";

export interface PanelState {
  explorerOpen: boolean;
  chatOpen: boolean;
}

let state: PanelState = { explorerOpen: true, chatOpen: true };
const listeners = new Set<() => void>();

export function getPanels(): PanelState {
  return state;
}

export function setPanel(which: PanelName, open: boolean): void {
  const key = which === "explorer" ? "explorerOpen" : "chatOpen";
  // Guarded so a caller re-asserting the current value does not wake every subscriber.
  if (state[key] === open) return;
  state = { ...state, [key]: open };
  for (const listener of listeners) listener();
}

export function togglePanel(which: PanelName): void {
  setPanel(which, which === "explorer" ? !state.explorerOpen : !state.chatOpen);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePanels(): PanelState {
  return useSyncExternalStore(subscribe, getPanels, getPanels);
}