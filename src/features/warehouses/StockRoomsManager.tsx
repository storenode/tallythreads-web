import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Pencil } from "lucide-react";
import { db } from "@/db";
import type { Warehouse, WarehouseType } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { StockPlacementCard } from "@/features/inventory/placement/StockPlacementCard";
import {
  createWarehouse,
  attachStore,
  updateWarehouse,
  useStoreWarehouseLinks,
  useWarehousesByOrg,
} from "./data";
import { WAREHOUSE_TYPES, WAREHOUSE_TYPE_META, WarehouseTypeBadge } from "./ui";

/**
 * One accordion row for a stock room: header (chevron + name + type badge +
 * location count + edit icon); expanded body shows an optional inline name/type
 * editor (revealed by the edit icon) plus the room's stock locations
 * (Floor › Section › Rack/Zone) via the shared {@link StockPlacementCard}.
 * The row's **Save** commits the name/type edit and collapses — locations write
 * locally as you go and sync in a batch (offline-first; no per-action call).
 */
function StockRoomRow({
  warehouse,
  canDesign,
  expanded,
  onToggle,
}: {
  warehouse: Warehouse;
  canDesign: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [editingDetails, setEditingDetails] = useState(false);
  const [name, setName] = useState(warehouse.name);
  const [type, setType] = useState<WarehouseType>(warehouse.warehouse_type);
  const [saving, setSaving] = useState(false);

  const locationCount = useLiveQuery(async () => {
    if (!warehouse.id) return 0;
    return (
      await db.stock_locations.where("warehouse_id").equals(warehouse.id).toArray()
    ).filter((r) => !r.deleted_at).length;
  }, [warehouse.id]);

  const startEdit = () => {
    setName(warehouse.name);
    setType(warehouse.warehouse_type);
    setEditingDetails(true);
    if (!expanded) onToggle();
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editingDetails && name.trim()) {
        await updateWarehouse(warehouse._localId, {
          name: name.trim(),
          warehouse_type: type,
        });
      }
      setEditingDetails(false);
      onToggle(); // collapse
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            size={16}
            className={`shrink-0 text-fg-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 truncate font-medium text-fg group-hover:text-tt-green-600">
            {warehouse.name}
          </span>
          <WarehouseTypeBadge type={warehouse.warehouse_type} />
          {!!locationCount && (
            <span className="shrink-0 text-xs text-fg-muted">
              {locationCount} location{locationCount === 1 ? "" : "s"}
            </span>
          )}
        </button>
        {canDesign && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Edit ${warehouse.name}`}
            className="shrink-0 rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border p-3">
          {editingDetails && canDesign && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Name"
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
            </div>
          )}

          {warehouse.id && (
            <StockPlacementCard
              owner={{ store_id: null, warehouse_id: warehouse.id }}
              canDesign={canDesign}
              bare
              title="Stock locations"
              desc="Floors, sections, racks, and zones inside this stock room. Optional."
            />
          )}

          {canDesign && (
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggle}
                disabled={saving}
              >
                Close
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Stock-rooms manager for one scope — org-wide (no `storeId`) or a single
 * store's rooms (`storeId` set). Lists rooms as an accordion (expand to view /
 * add stock locations inside each), adds a room via inline name/type fields
 * (a store-scoped add auto-attaches to that store), and auto-expands a
 * newly-added room so its locations can be set up straight away. `bare` renders
 * it as a section for embedding inside another card.
 */
export function StockRoomsManager({
  orgId,
  storeId,
  canDesign,
  title = "Stock rooms",
  desc,
  bare = false,
}: {
  orgId: string;
  storeId?: string;
  canDesign: boolean;
  title?: string;
  desc?: string;
  bare?: boolean;
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

  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const toggle = (localId: string) =>
    setExpandedId((cur) => (cur === localId ? null : localId));

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
      // Auto-expand the new room so its stock locations can be added right away.
      if (wh._localId) setExpandedId(wh._localId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't add the stock room.",
      );
    } finally {
      setSaving(false);
    }
  };

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
                  {saving ? "Saving…" : "Save"}
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
            <StockRoomRow
              key={w._localId}
              warehouse={w}
              canDesign={canDesign}
              expanded={expandedId === w._localId}
              onToggle={() => toggle(w._localId)}
            />
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
