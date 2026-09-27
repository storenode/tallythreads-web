import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { PackageCheck, Tags } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { Tabs, type TabItem } from "@/components/ui/tabs/Tabs";
import { useMember } from "@/features/auth/useMember";
import { hasPermission, useEntitlements } from "@/features/auth/entitlements";
import { useStoresByOrg } from "@/features/stores/stores";
import { formatInr } from "@/lib/money";
import { useCategoriesByOrg } from "../categories";
import { useReadyForInventory } from "../readyForInventory";

/**
 * Organization Inventory (`/org/:orgId/inventory`, specs/roadmap/inventory.md §2–§3).
 * Org roles only (`inventory.manage`): this is where Deliveries' "Ready for Inventory" stock is
 * processed at the organization — catalogued, priced, SKU'd, labelled and dispatched. Phase 2A
 * shows the incoming queue (with landed cost) and the org-wide category codes; cataloguing and
 * MRP pricing land in Phase 2B.
 */
export default function OrgInventoryPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { member } = useMember();
  const { data: entitlements, isLoading } = useEntitlements(member?.id);
  const canManage = hasPermission(entitlements, "inventory.manage", {
    organizationId: orgId,
  });

  if (isLoading || !entitlements) return null;
  if (!canManage) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">
          Inventory is managed by the organization&apos;s owners and managers.
        </p>
      </Card>
    );
  }

  const tabs: TabItem[] = [
    {
      id: "ready",
      label: "Ready for inventory",
      icon: <PackageCheck size={18} />,
      content: <ReadyForInventoryTab orgId={orgId!} />,
    },
    {
      id: "categories",
      label: "Categories",
      icon: <Tags size={18} />,
      content: <CategoriesTab orgId={orgId!} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeading>Inventory</PageHeading>
      <Tabs items={tabs} defaultActiveId="ready" />
    </div>
  );
}

function ReadyForInventoryTab({ orgId }: { orgId: string }) {
  const ready = useReadyForInventory(orgId);

  if (ready === undefined) {
    return <p className="text-sm text-fg-muted">Loading…</p>;
  }
  if (ready.length === 0) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">
          Nothing is waiting. Parcels appear here once they reach{" "}
          <span className="font-medium text-fg">Ready for Inventory</span> on the{" "}
          <Link to={`/org/${orgId}/deliveries`} className="text-tt-green-600 hover:underline">
            Deliveries
          </Link>{" "}
          page.
        </p>
      </Card>
    );
  }

  const totalPieces = ready.reduce(
    (s, r) => s + r.lines.reduce((t, l) => t + l.receivedQty, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {ready.length} invoice{ready.length === 1 ? "" : "s"} · {totalPieces} pieces waiting to be
        catalogued. Next step (coming soon): split each line into items (colour · size · qty), set
        MRP, allocate to stores, then generate SKUs and print labels.
      </p>
      {ready.map(({ invoice, tripTitle, lines }) => (
        <Card key={invoice._localId}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{invoice.supplier_name}</p>
              <p className="text-xs text-fg-muted">
                {tripTitle}
                {invoice.supplier_invoice_no ? ` · #${invoice.supplier_invoice_no}` : ""}
                {invoice.approved_at ? ` · approved ${invoice.approved_at.slice(0, 10)}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-tt-green-600/15 px-2 py-0.5 text-xs font-medium text-tt-green-700">
              ✅ Ready for Inventory
            </span>
          </div>

          {/* Stacked rows (no wide table) — reads the same on a phone and a desktop. */}
          <ul className="mt-4 divide-y divide-border">
            {lines.map(({ item, receivedQty, landedUnitCostPaise }) => (
              <li
                key={item._localId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm"
              >
                {/* Full-width name on phones (never truncated to "Cotton …"); inline from sm. */}
                <span className="min-w-0 basis-full text-fg sm:basis-auto sm:flex-1 sm:truncate">
                  {item.description}
                </span>
                <span className="text-fg-muted">
                  {receivedQty} pcs
                  {receivedQty !== item.quantity && (
                    <span className="ml-1 text-xs text-amber-600">(invoiced {item.quantity})</span>
                  )}
                </span>
                <span className="w-32 text-right text-fg-muted">
                  landed{" "}
                  <span className="font-medium text-fg">
                    {landedUnitCostPaise != null ? formatInr(landedUnitCostPaise) : "—"}
                  </span>
                  /pc
                </span>
              </li>
            ))}
            {lines.length === 0 && (
              <li className="py-2 text-sm text-fg-muted">No line items on this invoice.</li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function CategoriesTab({ orgId }: { orgId: string }) {
  const categories = useCategoriesByOrg(orgId);
  const { data: stores } = useStoresByOrg(orgId);

  // One row per org-wide category (name ↔ code), with the stores that carry it.
  const rows = useMemo(() => {
    const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
    const byName = new Map<string, { name: string; code: string; stores: string[] }>();
    for (const c of categories ?? []) {
      const key = c.name.trim().toLowerCase();
      const row = byName.get(key) ?? { name: c.name, code: c.code ?? "…", stores: [] };
      row.stores.push(storeName.get(c.store_id) ?? "—");
      byName.set(key, row);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, stores]);

  if (categories === undefined) {
    return <p className="text-sm text-fg-muted">Loading…</p>;
  }

  return (
    <Card
      title="Categories"
      desc="Each store picks its own categories (setup wizard → Stores). The short code goes into barcodes and is the same in every store — edit it from a store's Categories card."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">No categories yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-14 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-center font-mono text-xs text-fg-muted">
                {r.code}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.name}</span>
              <span className="text-xs text-fg-muted">
                {r.stores.length} store{r.stores.length === 1 ? "" : "s"}: {r.stores.sort().join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
