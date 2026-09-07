import { useEffect } from "react";
import { drainPendingReceipts } from "./receiptQueue";

const INTERVAL_MS = 60_000;

/**
 * Headless: mounts once near the app root so offline-captured receipts are extracted
 * app-wide — on mount, on reconnect (`online`), on foreground, and a light interval —
 * not only while the owner happens to be on a trip detail page. `drainPendingReceipts`
 * itself is single-flight and no-ops when offline, so every trigger can fire freely.
 */
export function ReceiptDrainManager() {
  useEffect(() => {
    const run = () => void drainPendingReceipts();
    run();

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const intervalId = window.setInterval(run, INTERVAL_MS);

    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
