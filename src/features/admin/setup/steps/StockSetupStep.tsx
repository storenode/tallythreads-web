import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { SingleSelect } from "@/components/ui/SingleSelect";
import type { Warehouse } from "@/db";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements, hasPermission } from "@/features/auth/entitlements";
import { useStoresByOrg } from "@/features/stores/stores";
import { StockPlacementCard } from "@/features/inventory/placement/StockPlacementCard";
import { StockRoomsManager } from "@/features/warehouses/StockRoomsManager";
import { WarehouseEditCard } from "@/features/warehouses/WarehouseEditCard";
import { useSetupOrg } from "../SetupWizardLayout";
import { SetupStepFooter } from "./SetupStepFooter";

/**
 * Wizard step 3 — stock setup. An org-wide stock-rooms section sits on top;
 * below, a store picker reveals a single "Store stock" card holding that
 * store's stock locations and its own stock rooms. Editing a specific stock
 * room takes the whole step over (option B — no nested cards). Everything
 * reuses the app's real components; the store is preselected from `?store=`.
 */
export default function StockSetupStep() {
  const { org } = useSetupOrg();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const { data: stores } = useStoresByOrg(org.id);
  const [params, setParams] = useSearchParams();
  const [editingRoom, setEditingRoom] = useState<Warehouse | null>(null);

  const canDesign = hasPermission(entitlements, "store.edit", {
    organizationId: org.id,
  });

  const selectedStoreId = params.get("store") ?? "";
  const setStore = (id: string) =>
    setParams(id ? { store: id } : {}, { replace: true });

  const selectedStore = (stores ?? []).find((s) => s.id === selectedStoreId);

  // Option B: editing one stock room takes over the step.
  if (editingRoom) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setEditingRoom(null)}
          className="text-sm font-medium text-fg-muted hover:text-fg"
        >
          ← Back to stock setup
        </button>
        <WarehouseEditCard
          warehouse={editingRoom}
          orgId={org.id}
          canDesign={canDesign}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Org-wide stock rooms (not tied to a single store). */}
      <div id="org-stock-rooms">
        <StockRoomsManager
          orgId={org.id}
          canDesign={canDesign}
          title="Organization stock rooms"
          desc="Org-wide storage not tied to one store — a central godown, transit hold, or shared warehouse."
          onEditRoom={setEditingRoom}
        />
      </div>

      {/* One card for a store's stock: locations + its own rooms. */}
      <Card
        title="Store stock"
        desc="Pick a store to set up its stock locations (floors, sections, racks) and its own stock rooms."
        actions={
          <div className="w-56">
            <SingleSelect
              placeholder="Select a store…"
              value={selectedStoreId}
              onChange={(e) => setStore(e.target.value)}
              options={(stores ?? []).map((s) => ({
                value: s.id,
                label: s.store_code ? `${s.name} (${s.store_code})` : s.name,
              }))}
            />
          </div>
        }
      >
        {!selectedStore ? (
          <p className="text-sm text-fg-muted">
            Select a store above to set up its stock locations and stock rooms.
          </p>
        ) : (
          <div className="space-y-6">
            <StockPlacementCard
              owner={{ store_id: selectedStore.id, warehouse_id: null }}
              canDesign={canDesign}
              bare
              title="Stock locations"
              desc="Where stock sits in this store — floors, sections, racks, and zones. Optional."
            />

            <div className="border-t border-border pt-6">
              <StockRoomsManager
                orgId={org.id}
                storeId={selectedStore.id}
                canDesign={canDesign}
                bare
                title="Stock rooms"
                desc="Storage this store uses off the selling floor — a backyard, understairs, or stockroom."
                onEditRoom={setEditingRoom}
              />
            </div>
          </div>
        )}
      </Card>

      <SetupStepFooter back="stores" next="go-live" nextLabel="Next: Go live →" />
    </div>
  );
}
