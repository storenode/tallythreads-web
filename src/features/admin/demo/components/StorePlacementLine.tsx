import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { summarizeRows } from "./demoPlacement";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/**
 * One-line stock-placement summary for a store, shown inside the demo store cards. Reads from
 * the local offline DB (Dexie) — same source the store edit page uses — so demo placements
 * created via the real write-through show immediately, before the outbox finishes syncing.
 */
export function StorePlacementLine({ storeId }: { storeId: string }) {
  const rows = useLiveQuery(
    async () =>
      (await db.stock_locations.where("store_id").equals(storeId).toArray()).filter(
        (r) => !r.deleted_at,
      ),
    [storeId],
  );
  const text = rows === undefined ? "…" : summarizeRows(rows);

  return (
    <div className="mt-3">
      <p
        className="mb-1 text-[11px] tracking-wide text-gray-400 uppercase dark:text-gray-500"
        style={{ fontFamily: MONO }}
      >
        Placement
      </p>
      <p
        className="text-[12px] text-gray-600 dark:text-gray-300"
        style={{ fontFamily: MONO }}
      >
        {text}
      </p>
    </div>
  );
}
