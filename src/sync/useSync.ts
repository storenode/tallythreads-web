import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  getSyncStatus,
  runSync,
  subscribeSyncStatus,
  type SyncStatus,
} from "./syncEngine";

const INTERVAL_MS = 45_000;

export interface UseSync extends SyncStatus {
  /** Manual "Sync now" trigger. */
  syncNow: () => void;
}

/**
 * Wires the sync engine to its triggers for the lifetime of the mounting
 * component: reconnect (`online`), app foreground (`visibilitychange`), a light
 * 45s interval, plus one run on mount. `runSync` itself guards against being
 * offline and against overlapping runs, so every trigger can fire freely.
 */
export function useSync(): UseSync {
  const status = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatus,
    getSyncStatus,
  );

  useEffect(() => {
    void runSync();

    const onOnline = () => void runSync();
    const onVisible = () => {
      if (document.visibilityState === "visible") void runSync();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const intervalId = window.setInterval(() => void runSync(), INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, []);

  const syncNow = useCallback(() => void runSync(), []);

  return { ...status, syncNow };
}
