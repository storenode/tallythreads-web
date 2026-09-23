import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, Store, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tabs, type TabItem } from "@/components/ui/tabs/Tabs";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements, hasPermission } from "@/features/auth/entitlements";
import { useStoresByOrg, type OrgStore } from "@/features/stores/stores";
import { StockPlacementCard } from "@/features/inventory/placement/StockPlacementCard";
import { StockRoomsManager } from "@/features/warehouses/StockRoomsManager";
import { useSetupOrg } from "../SetupWizardLayout";
import { SetupStepFooter } from "./SetupStepFooter";

/**
 * The selected store shown as an expandable row (parity with the stock-room
 * accordion): expand to add/edit its stock locations (Floor › Section ›
 * Rack/Zone). Locations write locally as you go; Save collapses the panel.
 */
function StoreStockRow({
  store,
  canDesign,
}: {
  store: OrgStore;
  canDesign: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const locationCount = useLiveQuery(
    async () =>
      (await db.stock_locations.where("store_id").equals(store.id).toArray())
        .filter((r) => !r.deleted_at).length,
    [store.id],
  );

  return (
    <div className="rounded-lg border border-border bg-bg-elevated">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-fg-muted transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 truncate font-medium text-fg group-hover:text-tt-green-600">
          {store.name}
        </span>
        {store.store_code && (
          <span className="shrink-0 text-xs text-fg-muted">
            {store.store_code}
          </span>
        )}
        {!!locationCount && (
          <span className="shrink-0 text-xs text-fg-muted">
            {locationCount} location{locationCount === 1 ? "" : "s"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border p-3">
          <StockPlacementCard
            owner={{ store_id: store.id, warehouse_id: null }}
            canDesign={canDesign}
            bare
            title="Stock locations"
            desc="Where stock sits in this store — floors, sections, racks, and zones. Optional."
          />
          {canDesign && (
            <div className="flex justify-end border-t border-border pt-3">
              <Button type="button" size="sm" onClick={() => setExpanded(false)}>
                Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Wizard step 3 — stock setup, in two tabs. "Organization stock rooms" manages
 * org-wide rooms; "Store stocks" picks a store to set up its stock locations and
 * its own rooms. Stock rooms are an accordion — expand a room to add/edit its
 * stock locations inline. The store is preselected from `?store=`.
 */
export default function StockSetupStep() {
  const { org } = useSetupOrg();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const { data: stores } = useStoresByOrg(org.id);
  const [params, setParams] = useSearchParams();

  const canDesign = hasPermission(entitlements, "store.edit", {
    organizationId: org.id,
  });

  const selectedStoreId = params.get("store") ?? "";
  const setStore = (id: string) =>
    setParams(id ? { store: id } : {}, { replace: true });

  const selectedStore = (stores ?? []).find((s) => s.id === selectedStoreId);

  const tabs: TabItem[] = [
    {
      id: "org-rooms",
      label: "Organization stock rooms",
      icon: <Boxes size={18} />,
      content: (
        <div id="org-stock-rooms">
          <StockRoomsManager
            orgId={org.id}
            canDesign={canDesign}
            title="Organization stock rooms"
            desc="Org-wide storage not tied to one store — a central godown, transit hold, or shared warehouse. Expand a room to set up its stock locations (floors, sections, racks, zones)."
          />
        </div>
      ),
    },
    {
      id: "store-stock",
      label: "Store stocks",
      icon: <Store size={18} />,
      content: (
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
              <StoreStockRow store={selectedStore} canDesign={canDesign} />

              <div className="border-t border-border pt-6">
                <StockRoomsManager
                  orgId={org.id}
                  storeId={selectedStore.id}
                  canDesign={canDesign}
                  bare
                  title="Stock rooms"
                  desc="Storage this store uses off the selling floor — a backyard, understairs, or stockroom. Expand a room to set up its stock locations."
                />
              </div>
            </div>
          )}
        </Card>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Arriving from the Stores step (?store=) lands on the Store stocks tab. */}
      <Tabs items={tabs} defaultActiveId={selectedStoreId ? "store-stock" : "org-rooms"} />

      <SetupStepFooter back="stores" next="members" nextLabel="Next: Members →" />
    </div>
  );
}
