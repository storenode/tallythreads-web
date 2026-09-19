import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { Warehouse, WarehouseType } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import {
  createWarehouse,
  attachStore,
  useStoreWarehouseLinks,
  useWarehousesByOrg,
} from "./data";
import { WAREHOUSE_TYPES, WAREHOUSE_TYPE_META, WarehouseTypeBadge } from "./ui";
import { WarehouseEditCard } from "./WarehouseEditCard";

/**
 * Stock-rooms manager for one scope — org-wide (no `storeId`) or a single
 * store's rooms (`storeId` set). Lists rooms and adds one (a store-scoped add
 * auto-attaches). Editing reuses {@link WarehouseEditCard}: inline by default,
 * or delegated to the parent via `onEditRoom` (so the setup wizard can take the
 * whole step over instead of nesting the editor). `bare` renders it as a
 * section (heading + body) for embedding inside another card.
 */
export function StockRoomsManager({
  orgId,
  storeId,
  canDesign,
  title = "Stock rooms",
  desc,
  bare = false,
  onEditRoom,
}: {
  orgId: string;
  storeId?: string;
  canDesign: boolean;
  title?: string;
  desc?: string;
  bare?: boolean;
  /** When provided, editing a room is delegated to the parent (step takeover)
   * instead of the built-in inline editor. */
  onEditRoom?: (warehouse: Warehouse) => void;
}) {
  const orgWarehouses = useWarehousesByOrg(orgId);
  const links = useStoreWarehouseLinks(storeId);
  const storeWarehouses = useLiveQuery(async () => {
    if (!storeId) return undefined;
    const ids = (links ?? []).map((l) => l.warehouse_id);
    if (ids.length === 0) return [] as Warehouse[];
    return (await db.warehouses.where("id").anyOf(ids).toArray()).filter(
      (w) => !w.deleted_at,
    );
  }, [storeId, links]);

  const warehouses = storeId ? storeWarehouses : orgWarehouses;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<WarehouseType>(
    storeId ? "backyard" : "godown",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAdd = () => {
    setAdding(false);
    setName("");
    setType(storeId ? "backyard" : "godown");
    setError(null);
  };

  const openRoom = (w: Warehouse) => {
    if (onEditRoom) onEditRoom(w);
    else setEditingId(w._localId);
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
      if (storeId && wh.id) await attachStore(wh.id, storeId);
      resetAdd();
      openRoom(wh as Warehouse);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't add the stock room.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Built-in inline edit view (only when the parent isn't handling it).
  const editing = (warehouses ?? []).find((w) => w._localId === editingId);
  if (!onEditRoom && editingId && editing) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setEditingId(null)}
          className="text-sm font-medium text-fg-muted hover:text-fg"
        >
          ← Back to stock rooms
        </button>
        <WarehouseEditCard
          warehouse={editing}
          orgId={orgId}
          canDesign={canDesign}
        />
      </div>
    );
  }

  const addAction =
    canDesign && !adding ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAdding(true)}
      >
        + Add stock room
      </Button>
    ) : undefined;

  const body =
    warehouses === undefined ? (
      <p className="text-sm text-fg-muted">Loading…</p>
    ) : (
      <div className="space-y-2">
        {adding && canDesign && (
          <div className="rounded-lg border border-brand/40 bg-surface-2/40 p-3">
            <div className="space-y-3">
              <Input
                label="Name"
                placeholder={storeId ? "Backyard" : "Central Godown"}
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
                  {saving ? "Adding…" : "Add & set up"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={resetAdd}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {warehouses.length === 0 && !adding ? (
          <p className="text-sm text-fg-muted">
            {storeId
              ? "No stock rooms for this store yet — add a backyard or understairs space. Optional."
              : "No organization stock rooms yet — add a central godown or transit hold. Optional."}
          </p>
        ) : (
          warehouses.map((w) => (
            <button
              key={w._localId}
              type="button"
              onClick={() => openRoom(w)}
              className="group flex w-full items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-fg group-hover:text-tt-green-600">
                {w.name}
              </span>
              <WarehouseTypeBadge type={w.warehouse_type} />
            </button>
          ))
        )}
      </div>
    );

  if (bare) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-fg">{title}</h4>
            {desc && <p className="mt-0.5 text-xs text-fg-muted">{desc}</p>}
          </div>
          {addAction}
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card title={title} desc={desc} actions={addAction}>
      {body}
    </Card>
  );
}
