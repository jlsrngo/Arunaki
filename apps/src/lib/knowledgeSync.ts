import { apiFetch, API_BASE } from './api';

let isSyncing = false;
let lastSyncTimestamp = 0;
const syncListeners = new Set<(result: any) => void>();

export function subscribeKnowledgeSync(listener: (result: any) => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

/**
 * Triggers background synchronization of external knowledge sources (Google Sheets, URLs).
 * Non-blocking, fire-and-forget, with concurrent guard.
 */
export async function triggerKnowledgeSync(explicitDirectory?: string, force = false): Promise<boolean> {
  const now = Date.now();
  // Debounce unless forced: do not re-sync within 10 seconds
  if (!force && now - lastSyncTimestamp < 10000) {
    return false;
  }

  if (isSyncing) {
    return false;
  }

  const folder = explicitDirectory || localStorage.getItem('arunaki_active_folder');
  if (!folder) {
    return false;
  }

  isSyncing = true;
  try {
    const url = `${API_BASE}/knowledge/sync?directory=${encodeURIComponent(folder)}`;
    const res = await apiFetch(url, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      lastSyncTimestamp = Date.now();
      syncListeners.forEach((listener) => {
        try {
          listener(data);
        } catch {}
      });
      return true;
    }
  } catch (err) {
    // Silent fail in background — agent falls back to existing local cache
    console.debug('[KnowledgeSync] Background sync skipped or offline:', err);
  } finally {
    isSyncing = false;
  }
  return false;
}

/**
 * Checks if a periodic or focus-based sync is needed (e.g. if stale > thresholdMs).
 */
export function triggerKnowledgeSyncIfStale(thresholdMs = 15 * 60 * 1000, directory?: string): void {
  const now = Date.now();
  if (now - lastSyncTimestamp >= thresholdMs) {
    triggerKnowledgeSync(directory);
  }
}
