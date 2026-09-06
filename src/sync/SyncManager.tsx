import { useSync } from "./useSync";

/**
 * Headless: mounts once near the app root to run the sync engine's triggers
 * (reconnect / foreground / interval) for the whole session. Renders nothing.
 */
export function SyncManager() {
  useSync();
  return null;
}
