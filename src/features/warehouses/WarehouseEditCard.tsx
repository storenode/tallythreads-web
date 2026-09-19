import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { useStoresByOrg } from "@/features/stores/stores";
import { StockPlacementCard } from "@/features/inventory/placement/StockPlacementCard";
import type { Warehouse, WarehouseType } from "@/db";
import {
  useWarehouseLinks,
  updateWarehouse,
  attachStore,
  detachStore,
} from "./data";
import { WAREHOUSE_TYPES, WAREHOUSE_TYPE_META } from "./ui";

/**
 * Inline editor for one stock room: details (name/type/note), attached stores,
 * and its internal stock locations (via the shared {@link StockPlacementCard}).
 * Extracted from WarehouseEditPage so the same surface is reused both there and
 * inline in the setup wizard — one component for reading and editing, no
 * separate forms.
 */
export function WarehouseEditCard({
  warehouse,
  orgId,
  canDesign,
}: {
  warehouse: Warehouse;
  orgId: string;
  canDesign: boolean;
}) {
  const warehouseId = warehouse.id as string;
  const links = useWarehouseLinks(warehouseId);
  const { data: stores } = useStoresByOrg(orgId);

  const [name, setName] = useState(warehouse.name);
  const [type, setType] = useState<WarehouseType>(warehouse.warehouse_type);
  const [note, setNote] = useState(warehouse.note ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(warehouse.name);
    setType(warehouse.warehouse_type);
    setNote(warehouse.note ?? "");
  }, [warehouse._localId]); // eslint-disable-line react-hooks/exhaustive-deps

  const attachedIds = useMemo(
    () => new Set((links ?? []).map((l) => l.store_id)),
    [links],
  );

  const saveDetails = async () => {
    if (!name.trim()) return;
    await updateWarehouse(warehouse._localId, {
      name: name.trim(),
      warehouse_type: type,
      note: note.trim() || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const toggleStore = async (storeId: string) => {
    if (attachedIds.has(storeId)) await detachStore(warehouseId, storeId);
    else await attachStore(warehouseId, storeId);
  };

  return (
    <div className="space-y-6">
      <Card
        title="Stock room"
        desc="Backyard, stockroom, or godown — a space that holds stock off the selling floor."
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canDesign}
          />
          <SingleSelect
            label="Type"
            placeholder={null}
            value={type}
            onChange={(e) => setType(e.target.value as WarehouseType)}
            disabled={!canDesign}
            options={WAREHOUSE_TYPES.map((t) => ({
              value: t,
              label: WAREHOUSE_TYPE_META[t].label,
            }))}
          />
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!canDesign}
          />
          {canDesign && (
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" onClick={saveDetails}>
                Save changes
              </Button>
              {saved && <span className="text-xs text-fg-muted">Saved ✓</span>}
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Attached stores"
        desc="Which stores draw stock from this stock room. A central godown serves many; a store's own backyard, one."
      >
        {(stores?.length ?? 0) === 0 ? (
          <p className="text-sm text-fg-muted">No stores in this org yet.</p>
        ) : (
          <div className="space-y-2">
            {stores!.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={attachedIds.has(s.id)}
                  onChange={() => toggleStore(s.id)}
                  disabled={!canDesign}
                />
                <span className="text-fg">{s.name}</span>
                {s.store_code && (
                  <span className="text-xs text-fg-muted">{s.store_code}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </Card>

      <StockPlacementCard
        owner={{ store_id: null, warehouse_id: warehouseId }}
        canDesign={canDesign}
        desc="Where stock sits inside this stock room — floors, sections, racks, and zones. Optional."
      />
    </div>
  );
}
