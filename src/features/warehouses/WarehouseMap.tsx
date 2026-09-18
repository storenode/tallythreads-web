import { useMemo, useState } from "react";
import { useOrgWarehouseMap } from "./data";
import { useStoresByOrg } from "@/features/stores/stores";
import { WarehouseTypeBadge } from "./ui";

/** Read-only "Stock room map" — which stock rooms serve which stores across the org.
 * Collapsible, like the archived-stores toggle. See specs/roadmap/warehouses.md §3.5. */
export function WarehouseMap({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const map = useOrgWarehouseMap(orgId);
  const { data: stores } = useStoresByOrg(orgId);

  const storeName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores ?? []) m.set(s.id, s.name);
    return m;
  }, [stores]);

  if (!map || map.length === 0) return null;

  return (
    <div className="border-t border-border pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-fg-muted hover:text-fg"
      >
        {open ? "Hide stock room map" : "Show stock room map"}
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {map.map(({ warehouse, storeIds }) => (
            <div
              key={warehouse._localId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-bg-elevated px-3 py-2"
            >
              <span className="font-medium text-fg">{warehouse.name}</span>
              <WarehouseTypeBadge type={warehouse.warehouse_type} />
              <span aria-hidden className="text-fg-muted">
                →
              </span>
              {storeIds.length === 0 ? (
                <span className="text-xs italic text-fg-muted">
                  org-wide — not yet attached to a store
                </span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {storeIds.map((sid) => (
                    <span
                      key={sid}
                      className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg"
                    >
                      {storeName.get(sid) ?? "store"}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
