import { Button } from "@/components/ui/Button";
import { useSync } from "./useSync";

/** Manual "Sync now" control — drop it into any settings / status surface. */
export function SyncNowButton() {
  const { syncing, syncNow } = useSync();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={syncing}
      onClick={syncNow}
    >
      {syncing ? "Syncing…" : "Sync now"}
    </Button>
  );
}
