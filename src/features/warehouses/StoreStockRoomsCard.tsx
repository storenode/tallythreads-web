import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { Warehouse, WarehouseType } from "@/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { createWarehouse, attachStore, useStoreWarehouseLinks } from "./data";
import { WAREHOUSE_TYPES, WAREHOUSE_TYPE_META, WarehouseTypeBadge } from "./ui";

/**
 * "Stock Rooms" card on the store edit page. Self-managing: adding a stock room creates a
 * warehouse (org-owned) and auto-links it to THIS store — for a store's own backyard /
 * understairs / non-display space. See specs/roadmap/warehouses.md §3.2.
 */
export function StoreStockRoomsCard({
  orgId,
  storeId,
  canDesign,
}: {
  orgId: string;
  storeId: string;
  canDesign: boolean;
}) {
  const navigate = useNavigate();
  const links = useStoreWarehouseLinks(storeId);

  // Resolve the linked warehouses (live).
  const warehouses = useLiveQuery(async () => {
    const ids = (links ?? []).map((l) => l.warehouse_id);
    if (ids.length === 0) return [] as Warehouse[];
    const rows = await db.warehouses.where("id").anyOf(ids).toArray();
    return rows.filter((w) => !w.deleted_at);
  }, [links]);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<WarehouseType>("backyard");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => (warehouses ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [warehouses],
  );

  const reset = () => {
    setAdding(false);
    setName("");
    setType("backyard");
    setError(null);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("A name is required.");
      return;
    }
    setSaving(true);
    try {
      const wh = await createWarehouse({
        organization_id: orgId,
        name: name.trim(),
        warehouse_type: type,
        note: null,
        sort_order: 0,
      });
      if (wh.id) await attachStore(wh.id, storeId);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the stock room.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Stock Rooms"
      desc="Storage this store uses off the selling floor — a backyard, understairs, or stockroom. Optional."
      actions={
        canDesign && !adding ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
            + Add stock room
          </Button>
        ) : undefined
      }
    >
      {warehouses === undefined ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : (
        <div className="space-y-2">
          {adding && canDesign && (
            <div className="rounded-lg border border-brand/40 bg-surface-2/40 p-3">
              <div className="space-y-3">
                <Input
                  label="Name"
                  placeholder="Backyard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <SingleSelect
                  label="Type"
                  placeholder={null}
                  value={type}
                  onChange={(e) => setType(e.target.value as WarehouseType)}
                  options={WAREHOUSE_TYPES.map((t) => ({
                    value: t,
                    label: WAREHOUSE_TYPE_META[t].label,
                  }))}
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={save} disabled={saving}>
                    {saving ? "Adding…" : "Add"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={reset}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {sorted.length === 0 && !adding ? (
            <p className="text-sm text-fg-muted">
              No stock rooms for this store. Add a backyard or understairs space — or skip it,
              it&apos;s optional.
            </p>
          ) : (
            sorted.map((w) => (
              <div
                key={w._localId}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{w.name}</span>
                <WarehouseTypeBadge type={w.warehouse_type} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => w.id && navigate(`/org/${orgId}/stock-rooms/${w.id}/edit`)}
                >
                  Manage
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
