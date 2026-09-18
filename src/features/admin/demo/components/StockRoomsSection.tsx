import { useState } from "react";
import { Warehouse as WarehouseIcon } from "lucide-react";
import { useWarehousesByOrg } from "@/features/warehouses/data";
import { WarehouseTypeBadge } from "@/features/warehouses/ui";
import { useWarehouseLinks } from "@/features/warehouses/data";
import type { OrgStore } from "@/features/stores/stores";
import {
  seedDemoWarehouses,
  type DemoOrgType,
} from "./warehouses.demo";

const SANS = "'Plus Jakarta Sans', 'Inter', sans-serif";

function WarehouseRow({
  warehouseId,
  name,
  type,
  storeName,
}: {
  warehouseId: string;
  name: string;
  type: Parameters<typeof WarehouseTypeBadge>[0]["type"];
  storeName: (id: string) => string;
}) {
  const links = useWarehouseLinks(warehouseId);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <span className="font-medium text-gray-800 dark:text-white/90">{name}</span>
      <WarehouseTypeBadge type={type} />
      <span aria-hidden className="text-gray-400">→</span>
      {(links ?? []).length === 0 ? (
        <span className="italic text-gray-400 dark:text-gray-500">
          org-wide — not yet attached
        </span>
      ) : (
        (links ?? []).map((l) => (
          <span
            key={l._localId}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/10 dark:text-gray-300"
          >
            {storeName(l.store_id)}
          </span>
        ))
      )}
    </li>
  );
}

/**
 * Demo tooling: seed a demo org's stock rooms (backyard / godown, with store attachments and
 * placements) and show the resulting warehouse → store mapping. Mirrors the placement demo
 * integration. See specs/roadmap/warehouses.md §6.
 */
export function StockRoomsSection({
  orgId,
  orgType,
  stores,
}: {
  orgId: string;
  orgType: DemoOrgType;
  stores: OrgStore[];
}) {
  const warehouses = useWarehousesByOrg(orgId);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeName = (id: string) =>
    stores.find((s) => s.id === id)?.name ?? "store";

  const seed = async () => {
    setError(null);
    setSeeding(true);
    try {
      await seedDemoWarehouses(orgId, orgType, stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't seed stock rooms.");
    } finally {
      setSeeding(false);
    }
  };

  const already = (warehouses ?? []).length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4
          className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"
          style={{ fontFamily: SANS }}
        >
          <span className="text-tt-green-500">
            <WarehouseIcon size={16} />
          </span>
          Stock rooms
        </h4>
        <button
          type="button"
          onClick={seed}
          disabled={seeding || already}
          className="rounded-lg border border-gray-300 px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          {seeding ? "Seeding…" : already ? "Seeded" : "Seed stock rooms"}
        </button>
      </div>

      {error && <p className="mb-2 text-[13px] text-red-500">{error}</p>}

      {warehouses === undefined ? (
        <p className="text-[13px] text-gray-400 dark:text-gray-500">Loading…</p>
      ) : warehouses.length === 0 ? (
        <p className="text-[13px] text-gray-400 dark:text-gray-500">
          No stock rooms yet — seed a backyard/godown to see the warehouse → store mapping.
        </p>
      ) : (
        <ul className="space-y-2">
          {warehouses.map((w) => (
            <WarehouseRow
              key={w._localId}
              warehouseId={w.id as string}
              name={w.name}
              type={w.warehouse_type}
              storeName={storeName}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
