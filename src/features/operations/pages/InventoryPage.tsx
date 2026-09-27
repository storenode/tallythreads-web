import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Boxes, MapPin, PackageOpen, Warehouse as WarehouseIcon } from "lucide-react";
import { db } from "@/db";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { useMember } from "@/features/auth/useMember";
import { hasPermission, useEntitlements } from "@/features/auth/entitlements";
import { useCategoriesByStore } from "@/features/inventory/categories";
import { useStoreWarehouseLinks } from "@/features/warehouses/data";

/**
 * Store Inventory (`/ops/:storeId/inventory`, specs/roadmap/inventory.md §2, §8). For store
 * managers and sales staff (`inventory.read`): the store never creates items or sees cost —
 * stock arrives already labelled from the organization, and the store receives, places and
 * moves it. Phase 2A shows where stock will live (display locations + stock rooms) and the
 * store's categories; incoming dispatches and stock on hand arrive in Phases 2D–2E.
 */
export default function InventoryPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const { member } = useMember();
  const { data: entitlements, isLoading } = useEntitlements(member?.id);
  const canRead = hasPermission(entitlements, "inventory.read", { storeId });

  if (isLoading || !entitlements) return null;
  if (!canRead) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">You don&apos;t have access to this store&apos;s inventory.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading>Inventory</PageHeading>
      <StockOnHandCard />
      <IncomingCard />
      <WhereStockLivesCard storeId={storeId!} />
      <CategoriesCard storeId={storeId!} />
    </div>
  );
}

function StockOnHandCard() {
  return (
    <Card title="Stock on hand" desc="What this store holds, by location — no prices.">
      <div className="flex items-start gap-3 text-sm text-fg-muted">
        <Boxes className="mt-0.5 size-5 shrink-0" />
        <p>
          No stock yet. Items arrive already labelled from your organization; once they&apos;re
          received here you&apos;ll see them by location, and can scan a barcode (or type the
          SKU) to find or move one.
        </p>
      </div>
    </Card>
  );
}

function IncomingCard() {
  return (
    <Card title="Incoming from the organization" desc="Packages dispatched to this store.">
      <div className="flex items-start gap-3 text-sm text-fg-muted">
        <PackageOpen className="mt-0.5 size-5 shrink-0" />
        <p>
          Nothing dispatched yet. When the organization sends stock, receive it here by scanning
          each label — shortages or extras are flagged automatically.
        </p>
      </div>
    </Card>
  );
}

function WhereStockLivesCard({ storeId }: { storeId: string }) {
  const links = useStoreWarehouseLinks(storeId);
  const data = useLiveQuery(async () => {
    const display = (
      await db.stock_locations.where("store_id").equals(storeId).toArray()
    ).filter((l) => !l.deleted_at);
    const roomIds = (links ?? []).map((l) => l.warehouse_id);
    const rooms = roomIds.length
      ? (await db.warehouses.where("id").anyOf(roomIds).toArray()).filter((w) => !w.deleted_at)
      : [];
    const roomLocationCounts = new Map<string, number>();
    for (const room of rooms) {
      const n = (
        await db.stock_locations.where("warehouse_id").equals(room.id!).toArray()
      ).filter((l) => !l.deleted_at).length;
      roomLocationCounts.set(room.id!, n);
    }
    return { display, rooms, roomLocationCounts };
  }, [storeId, links]);

  if (!data) return null;
  const counts = data.display.reduce<Record<string, number>>((acc, l) => {
    acc[l.placement_type] = (acc[l.placement_type] ?? 0) + 1;
    return acc;
  }, {});
  const displaySummary = Object.entries(counts)
    .map(([type, n]) => `${n} ${type}${n === 1 ? "" : "s"}`)
    .join(" · ");

  return (
    <Card title="Where stock lives" desc="Received stock is placed in a stock room or on display.">
      <ul className="space-y-3 text-sm">
        <li className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-fg-muted" />
          <div>
            <p className="font-medium text-fg">Display</p>
            <p className="text-fg-muted">
              {data.display.length ? displaySummary : "No display locations set up yet."}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <WarehouseIcon className="mt-0.5 size-5 shrink-0 text-fg-muted" />
          <div className="min-w-0">
            <p className="font-medium text-fg">Stock rooms</p>
            {data.rooms.length ? (
              <ul className="text-fg-muted">
                {data.rooms.map((r) => (
                  <li key={r._localId} className="truncate">
                    {r.name}
                    {(() => {
                      const n = data.roomLocationCounts.get(r.id!) ?? 0;
                      return n ? ` · ${n} location${n === 1 ? "" : "s"}` : "";
                    })()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted">No stock rooms attached to this store.</p>
            )}
          </div>
        </li>
      </ul>
    </Card>
  );
}

function CategoriesCard({ storeId }: { storeId: string }) {
  const categories = useCategoriesByStore(storeId);
  if (categories === undefined) return null;
  return (
    <Card title="Categories" desc="The departments this store sells. The code appears on barcodes.">
      {categories.length === 0 ? (
        <p className="text-sm text-fg-muted">No categories set up for this store yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li
              key={c._localId}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm"
            >
              <span className="text-fg">{c.name}</span>
              {c.code && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg-muted">
                  {c.code}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
