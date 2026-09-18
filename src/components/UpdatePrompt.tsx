import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Listens for the `sp:sw-update-ready` event fired by {@link registerServiceWorker}
 * (src/pwa.ts) when a new build's service worker has downloaded and is waiting.
 *
 * With `registerType: "prompt"` (vite.config.ts) the waiting worker never takes
 * over on its own — an installed standalone PWA rarely fully closes, so without
 * this prompt the user keeps getting the old cached shell forever. Tapping
 * "Update" calls the plugin's `update()`, which activates the new worker and
 * reloads into it. Writes are Dexie-first (§2.I), so the reload is safe: pending
 * data is already persisted locally.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onReady(e: Event) {
      const detail = (e as CustomEvent<{ update: () => Promise<void> }>).detail;
      // Store the updater in a closure so setState doesn't try to call it.
      setUpdate(() => detail.update);
    }
    window.addEventListener("sp:sw-update-ready", onReady);
    return () => window.removeEventListener("sp:sw-update-ready", onReady);
  }, []);

  if (!update) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Update available</p>
          <p className="text-xs text-fg-muted">
            A newer version of TallyThreads is ready.
          </p>
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            // update() reloads the page; if it rejects, re-enable the button.
            void update().catch(() => setBusy(false));
          }}
        >
          {busy ? "Updating…" : "Update"}
        </Button>
      </div>
    </div>
  );
}
