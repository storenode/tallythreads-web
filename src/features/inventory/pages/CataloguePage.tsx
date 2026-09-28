import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  type Column,
  type ColumnDef,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Barcode, CheckCircle2, ChevronDown, Lock, LockOpen, Plus, Printer, Trash2, Truck } from "lucide-react";
import type { InventoryItem, PurchaseInvoice } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeading } from "@/components/ui/PageHeading";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { useMember } from "@/features/auth/useMember";
import { hasPermission, useEntitlements } from "@/features/auth/entitlements";
import { useStoresByOrg } from "@/features/stores/stores";
import { cn } from "@/lib/cn";
import { formatInr, rupeesToPaise } from "@/lib/money";
import type { MarginConfig, MarginRecipe } from "@/lib/purchaseMargin";
import {
  MRP_5_PERCENT_MAX_PAISE,
  suggestMrpPaise,
  type MrpRounding,
} from "@/lib/mrpPricing";
import { createCategory, useCategoriesByOrg } from "../categories";
import {
  cataloguedByLine,
  createInventoryItem,
  deleteInventoryItem,
  updateInventoryItem,
  useItemsForLines,
} from "../items";
import { useReadyForInventory, type ReadyLine } from "../readyForInventory";
import {
  finalizeItems,
  orgHoldings,
  resetItemSku,
  unlockItemLabels,
  useInvalidateInventory,
  useOrgStockLevels,
  useOrgTransfers,
  type OrgHolding,
  type TransferSummary,
} from "../distribution";
import { DispatchForm, DispatchesCard, DispatchesList, EditShipmentForm } from "../DispatchPanel";
import { Label, PrintLabelsButton, type PrintEntry } from "../LabelPrint";
import { layoutFromPref } from "../labels";
import { editRule, itemStage, type ItemStage } from "../itemStage";

/**
 * Catalogue one Ready-for-Inventory invoice (specs/roadmap/inventory.md §3 A–C, §4, §6):
 * split each received line into items (name · category · colour · size · qty · MRP · store),
 * and price them from landed cost. Org-only (inventory.manage). The lot forecast card was
 * removed for now (founder, 2026-09-28); `lotForecast` stays in lib/mrpPricing.ts.
 * There is no Finalize button (founder, 2026-09-28): the server numbers an item's SKU the first
 * time it's used — Barcode, Print or Dispatch (`ensureSkus`). After that its store, category,
 * colour, size and qty are fixed; name and MRP stay editable until the item is dispatched, then
 * the row is read-only. The page is one table grouped by invoice line (accordion on phones).
 */

// The rounding picker was removed (founder, 2026-09-28): suggested MRPs always round up to
// the next …99, the old default. Admins still edit any MRP freely.
const SUGGESTED_MRP_ROUNDING: MrpRounding = "end99";

function marginConfigOf(inv: PurchaseInvoice): MarginConfig {
  if (inv.margin_config) return { recipe: inv.margin_config as unknown as MarginRecipe };
  if (inv.margin_plugin_id) return { pluginId: inv.margin_plugin_id };
  return { recipe: { type: "flat", pct: 0 } };
}

const UNALLOCATED = "";
const rupees = (paise: number) => String(paise / 100);

export default function CataloguePage() {
  const { orgId, invoiceLocalId } = useParams<{ orgId: string; invoiceLocalId: string }>();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const canManage = hasPermission(entitlements, "inventory.manage", { organizationId: orgId });

  const ready = useReadyForInventory(orgId);
  const entry = ready?.find((r) => r.invoice._localId === invoiceLocalId);
  const lineIds = useMemo(
    () => (entry?.lines ?? []).map((l) => l.item.id).filter((x): x is string => !!x),
    [entry],
  );
  const items = useItemsForLines(lineIds);
  const { data: stores } = useStoresByOrg(orgId);
  const categories = useCategoriesByOrg(orgId);
  // Stock position + dispatches (server reads; null/empty offline — dispatch needs a connection).
  const levels = useOrgStockLevels(orgId);
  const invalidate = useInvalidateInventory();
  const transfers = useOrgTransfers(orgId);
  const holdings = useMemo(() => {
    if (!levels.data || !items) return null;
    return new Map(orgHoldings(levels.data, items).map((h) => [h.item.id!, h]));
  }, [levels.data, items]);
  const transfersByItem = useMemo(() => {
    const m = new Map<string, TransferSummary[]>();
    for (const t of transfers.data ?? []) {
      for (const ti of t.stock_transfer_items) m.set(ti.item_id, [...(m.get(ti.item_id) ?? []), t]);
    }
    return m;
  }, [transfers.data]);

  // Dispatch / edit-shipment views replace the table in place; they live in the URL so the
  // phone's back button returns to the table (?dispatch=1, ?ship=<transfer id>). After a
  // reload the picked items are gone, so the dispatch view falls back to the whole invoice.
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [dispatchPick, setDispatchPick] = useState<string[]>([]);
  // One selection across all lines (table ≥ sm and accordion < sm share it), keyed by item
  // _localId (group rows use "line:<id>"). Lines start open; this holds the collapsed ones.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleLine = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const [resetAsk, setResetAsk] = useState<ResetAsk | null>(null);
  const openView = (key: "dispatch" | "ship", value: string) =>
    setParams(
      (p) => {
        p.delete("dispatch");
        p.delete("ship");
        p.set(key, value);
        return p;
      },
      { state: { inApp: true } },
    );
  const closeView = () => {
    if ((location.state as { inApp?: boolean } | null)?.inApp) navigate(-1);
    else
      setParams(
        (p) => {
          p.delete("dispatch");
          p.delete("ship");
          return p;
        },
        { replace: true },
      );
  };

  // Org-wide categories by code (one name ↔ one code), and each store's category per code.
  const categoryOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const c of categories ?? []) if (c.code && !byCode.has(c.code)) byCode.set(c.code, c.name);
    return [...byCode.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);
  const storeCategoryId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories ?? []) if (c.code && c.id) m.set(`${c.store_id}|${c.code}`, c.id);
    return m;
  }, [categories]);

  if (!orgId || ready === undefined || items === undefined) {
    return <p className="text-sm text-fg-muted">Loading…</p>;
  }
  if (!canManage) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">Only organization owners and managers catalogue stock.</p>
      </Card>
    );
  }
  if (!entry) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">
          This invoice isn&apos;t waiting for inventory.{" "}
          <Link to={`/org/${orgId}/inventory`} className="text-tt-green-600 hover:underline">
            Back to Inventory
          </Link>
        </p>
      </Card>
    );
  }

  const margin = marginConfigOf(entry.invoice);
  const catalogued = cataloguedByLine(items);
  const lineEntries: LineEntry[] = entry.lines.map((line, i) => ({
    seq: i + 1,
    key: line.item._localId,
    line,
    items: items.filter((i) => i.source_invoice_item_id === line.item.id),
    catalogued: catalogued.get(line.item.id ?? "") ?? 0,
    suggestedMrp:
      line.landedUnitCostPaise != null
        ? suggestMrpPaise({
            landedUnitCostPaise: line.landedUnitCostPaise,
            isTrending: line.item.is_trending,
            margin,
            rounding: SUGGESTED_MRP_ROUNDING,
          })
        : 0,
  }));
  const selectedItems = items.filter((i) => rowSelection[i._localId]);
  const dispatchOpen = params.has("dispatch");
  const cataloguedPieces = items.reduce((n, i) => n + i.quantity, 0);
  const totalReceived = entry.lines.reduce((s, l) => s + l.receivedQty, 0);

  const ctx: RowContext = {
    orgId,
    stores: stores ?? [],
    categoryOptions,
    storeCategoryId,
    categoryNameByCode: new Map(categoryOptions.map((c) => [c.code, c.name])),
    holdings,
    transfersByItem,
    onDispatch: (itemLocalIds) => {
      setDispatchPick(itemLocalIds);
      openView("dispatch", "1");
    },
    refresh: invalidate,
    confirmReset: (item, what) =>
      new Promise<boolean>((resolve) => setResetAsk({ item, what, resolve })),
  };
  const itemIds = new Set(items.map((i) => i.id).filter(Boolean));
  const invoiceTransfers = (transfers.data ?? []).filter((t) =>
    t.stock_transfer_items.some((ti) => itemIds.has(ti.item_id)),
  );
  const editing = invoiceTransfers.find((t) => t.id === params.get("ship"));

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={`/org/${orgId}/inventory`}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Inventory
          </Link>
        }
      >
        Catalogue · {entry.invoice.supplier_name}
      </PageHeading>
      <p className="-mt-4 text-sm text-fg-muted">
        {entry.tripTitle}
        {entry.invoice.supplier_invoice_no ? ` · #${entry.invoice.supplier_invoice_no}` : ""} ·{" "}
        {cataloguedPieces} of {totalReceived} pieces catalogued
      </p>

      {dispatchOpen ? (
        <Card>
          {holdings ? (
            <DispatchForm
              orgId={orgId}
              items={dispatchPick.length ? items.filter((i) => dispatchPick.includes(i._localId)) : items}
              holdings={holdings}
              stores={stores ?? []}
              onBack={closeView}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-fg-muted">
                Loading stock… Dispatch needs a connection to see what&apos;s at the organization.
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={closeView}>
                ← Back to items
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <SelectionBar selected={selectedItems} ctx={ctx} />
          <InvoiceTable
            lines={lineEntries}
            ctx={ctx}
            memberId={member?.id ?? null}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            collapsed={collapsed}
            onToggleLine={toggleLine}
          />
          <InvoiceAccordion
            lines={lineEntries}
            ctx={ctx}
            memberId={member?.id ?? null}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            collapsed={collapsed}
            onToggleLine={toggleLine}
          />
        </Card>
      )}

      <ResetBarcodeDialog
        ask={resetAsk}
        onDone={(ok) => {
          resetAsk?.resolve(ok);
          setResetAsk(null);
        }}
      />

      {invoiceTransfers.length > 0 && (
        <DispatchesCard>
          {editing ? (
            <EditShipmentForm orgId={orgId} transfer={editing} stores={stores ?? []} onBack={closeView} />
          ) : (
            <DispatchesList
              transfers={invoiceTransfers}
              stores={stores ?? []}
              onEdit={(id) => openView("ship", id)}
            />
          )}
        </DispatchesCard>
      )}

      <p className="text-xs text-fg-muted">
        Generate a barcode (or print / dispatch) to give an item its SKU — needs a connection. Until
        labels are printed you can still change anything; changing its store, category, colour,
        size or qty resets the barcode. Once labels are printed the item is locked (&ldquo;Unlock to
        correct&rdquo; with a reason); once dispatched it&apos;s locked for good. Edits save as you go
        and work offline.
      </p>
    </div>
  );
}

/** Why the server would refuse to create SKUs for these drafts (zero MRP, missing store
 * category / store code) — so the owner can fix it in the table instead of reading an error. */
function skuProblems(items: InventoryItem[], ctx: RowContext): string[] {
  return [
    ...new Set(
      items
        .filter((i) => i.status === "draft")
        .flatMap((i) => {
          const out: string[] = [];
          const store = ctx.stores.find((s) => s.id === i.store_id);
          if (i.mrp_paise <= 0) out.push(`${i.name} ${i.color} ${i.size}: set an MRP`);
          if (i.store_id && !ctx.storeCategoryId.get(`${i.store_id}|${i.category_code}`)) {
            out.push(
              `${store?.name ?? "The store"} has no “${ctx.categoryNameByCode.get(i.category_code) ?? i.category_code}” category`,
            );
          }
          if (i.store_id && !store?.store_code) out.push(`${store?.name ?? "The store"} has no store code`);
          return out;
        }),
    ),
  ];
}

/**
 * There is no Finalize button: a draft gets its SKU the first time it's used — Barcode, Print or
 * Dispatch. Creates SKUs for the drafts among `items` (server RPC, needs a connection), refreshes
 * the stock numbers, and returns `items` with the drafts replaced by their finalized rows.
 */
async function ensureSkus(items: InventoryItem[], ctx: RowContext): Promise<InventoryItem[]> {
  const drafts = items.filter((i) => i.status === "draft");
  if (!drafts.length) return items;
  const problems = skuProblems(drafts, ctx);
  if (problems.length) throw new Error(`Can't create the SKU yet: ${problems.join(" · ")}`);
  const done = await finalizeItems(drafts);
  await ctx.refresh();
  const byLocalId = new Map(done.map((d) => [d._localId, d]));
  return items.map((i) => byLocalId.get(i._localId) ?? i);
}

/** Busy / error state for a button that may create SKUs first. */
function useSkuAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** This row's stage (see itemStage.ts — the server enforces the same lock rules). */
const stageOf = (item: InventoryItem, ctx: RowContext): ItemStage => itemStage(item, isDispatched(item, ctx));

/** A row is dispatched once any of its pieces left the organization — it's read-only then. */
function isDispatched(item: InventoryItem, ctx: RowContext): boolean {
  if (!item.id) return false;
  const h = ctx.holdings?.get(item.id);
  return (ctx.transfersByItem.get(item.id)?.length ?? 0) > 0 || (h?.inTransit ?? 0) + (h?.inStores ?? 0) > 0;
}

/**
 * What a Print click prints for `items` (finalized ones only, one label per piece): the labels
 * still outstanding, or — once everything is printed — a full reprint.
 */
function printPlanFor(items: InventoryItem[]): { entries: PrintEntry[]; total: number; reprint: boolean } {
  // Drafts count too: Print creates their SKUs first (ensureSkus), then prints every piece.
  const printable = items.filter((i) => i.status === "draft" || (i.status === "finalized" && i.sku));
  const outstanding = printable
    .map((item) => ({ item, copies: Math.max(0, item.quantity - item.labels_printed) }))
    .filter((e) => e.copies > 0);
  const reprint = outstanding.length === 0;
  const entries = reprint ? printable.map((item) => ({ item, copies: item.quantity })) : outstanding;
  return { entries, total: entries.reduce((n, e) => n + e.copies, 0), reprint };
}

/** Print step for PrintLabelsButton: create any missing SKUs, then print the fresh rows. */
const preparePrint = (items: InventoryItem[], ctx: RowContext) => async () =>
  printPlanFor(await ensureSkus(items, ctx)).entries;

const OUTLINE_BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

interface RowContext {
  orgId: string;
  stores: { id: string; name: string; store_code: string | null }[];
  categoryOptions: { code: string; name: string }[];
  storeCategoryId: Map<string, string>;
  categoryNameByCode: Map<string, string>;
  /** Stock position per item id; null until loaded (or offline). */
  holdings: Map<string, OrgHolding> | null;
  transfersByItem: Map<string, TransferSummary[]>;
  /** Open the dispatch view (replaces the table) with these items (_localId) picked. */
  onDispatch: (itemLocalIds: string[]) => void;
  /** Re-read stock levels + dispatches (after SKUs are created). */
  refresh: () => Promise<unknown>;
  /**
   * Ask before changing a barcoded item's SKU fields / qty; on "Reset", cancels its barcode
   * (server) and resolves true — the caller then saves the change on the (now draft) row.
   */
  confirmReset: (item: InventoryItem, what: string) => Promise<boolean>;
}

interface LineEntry {
  /** 1-based position of the line on the invoice ("1) Banarasi silk saree"). */
  seq: number;
  /** Invoice line _localId — the group key. */
  key: string;
  line: ReadyLine;
  items: InventoryItem[];
  catalogued: number;
  suggestedMrp: number;
}

const groupRowId = (key: string) => `line:${key}`;

/** "N of M catalogued" — green when complete, amber while pieces are left, red if too many. */
function CataloguedPill({ entry }: { entry: LineEntry }) {
  const { line, catalogued } = entry;
  const remaining = line.receivedQty - catalogued;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        remaining === 0
          ? "bg-success-bg text-success-text"
          : remaining < 0
            ? "bg-error-bg text-error-text"
            : "bg-warning-bg text-warning-text",
      )}
    >
      {catalogued} of {line.receivedQty} catalogued
      {remaining < 0 ? ` · ${-remaining} too many` : ""}
    </span>
  );
}

/** "All finalized" once every item of the line has its SKU. */
function FinalizedPill({ entry }: { entry: LineEntry }) {
  const { items } = entry;
  if (!items.length || items.some((i) => i.status === "draft")) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success-text">
      <Lock size={12} /> All finalized
    </span>
  );
}

/** Line summary: "1) Name  [N of M catalogued]", then received · landed · suggested MRP. */
function LineSummary({ entry, withFinalized }: { entry: LineEntry; withFinalized?: boolean }) {
  const { line, suggestedMrp } = entry;
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
        <span>
          <span className="text-fg-muted tabular-nums">{entry.seq})</span> {line.item.description}
        </span>
        <CataloguedPill entry={entry} />
        {withFinalized && <FinalizedPill entry={entry} />}
      </p>
      <p className="pl-5 text-xs font-normal text-fg-muted">
        {line.receivedQty} pcs received · landed{" "}
        {line.landedUnitCostPaise != null ? formatInr(line.landedUnitCostPaise) : "—"}/pc · suggested MRP{" "}
        {formatInr(suggestedMrp)}
      </p>
    </div>
  );
}

/** A line's own actions: + Add item and Print labels (creates any missing SKUs first). */
function LineActions({
  entry,
  ctx,
  memberId,
  align = "start",
  leading,
}: {
  entry: LineEntry;
  ctx: RowContext;
  memberId: string | null;
  align?: "start" | "end";
  /** Shown before the buttons (the table puts the line's status pills here). */
  leading?: ReactNode;
}) {
  const { line, items, catalogued, suggestedMrp } = entry;
  const remaining = line.receivedQty - catalogued;
  const problems = skuProblems(items, ctx);
  const plan = printPlanFor(items);

  const addItem = async () => {
    const first = guessCategory(line.item.description, ctx.categoryOptions);
    const store = ctx.stores.length === 1 ? ctx.stores[0].id : null;
    await createInventoryItem({
      organization_id: ctx.orgId,
      source_invoice_item_id: line.item.id ?? null,
      store_id: store,
      category_code: first?.code ?? "GEN",
      category_id: store && first ? (ctx.storeCategoryId.get(`${store}|${first.code}`) ?? null) : null,
      name: line.item.description,
      color: "Free",
      size: "Free",
      quantity: Math.max(1, remaining),
      mrp_paise: suggestedMrp,
      landed_unit_cost_paise: line.landedUnitCostPaise,
      created_by: memberId,
    });
  };

  return (
    <div className="space-y-2">
      <div className={cn("flex flex-wrap items-center gap-2", align === "end" && "justify-end")}>
        {leading}
        <Button type="button" size="sm" variant="ghost" onClick={addItem}>
          <Plus size={16} />
          Add item{remaining > 0 ? ` (${remaining} left)` : ""}
        </Button>
        {items.length > 0 && (
          <PrintLabelsButton
            orgId={ctx.orgId}
            entries={plan.entries}
            prepare={preparePrint(items, ctx)}
            disabled={plan.total === 0 || problems.length > 0}
            className={OUTLINE_BUTTON}
          >
            <Printer size={16} />
            {`${plan.reprint && plan.total > 0 ? "Reprint" : "Print"} labels${plan.total ? ` (${plan.total})` : ""}`}
          </PrintLabelsButton>
        )}
      </div>
      {problems.length > 0 && (
        <div className={cn("text-xs font-normal", align === "end" && "text-right")}>
          <p className="text-fg-muted">Before labels can be printed:</p>
          <ul className={cn("space-y-1 text-warning-text", align === "start" && "list-disc pl-5")}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Actions for the ticked rows across all lines (shown only while something is ticked). Both
 * create SKUs for ticked drafts first.
 */
function SelectionBar({ selected, ctx }: { selected: InventoryItem[]; ctx: RowContext }) {
  const plan = printPlanFor(selected);
  const problems = skuProblems(selected, ctx);
  const dispatchable = selected.filter(
    (i) => i.status === "draft" || (i.id && (ctx.holdings?.get(i.id)?.atOrg ?? 0) > 0),
  );
  const action = useSkuAction();
  if (selected.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dispatchable.length > 0 && ctx.holdings && (
          <button
            type="button"
            className={OUTLINE_BUTTON}
            disabled={action.busy || problems.length > 0}
            onClick={() =>
              action.run(async () => {
                const fresh = await ensureSkus(dispatchable, ctx);
                ctx.onDispatch(fresh.map((i) => i._localId));
              })
            }
          >
            <Truck size={16} /> {action.busy ? "Creating SKUs…" : "Dispatch selected"}
          </button>
        )}
        {plan.total > 0 && (
          <PrintLabelsButton
            orgId={ctx.orgId}
            entries={plan.entries}
            prepare={preparePrint(selected, ctx)}
            disabled={problems.length > 0}
            className={OUTLINE_BUTTON}
          >
            <Printer size={16} /> Print selected ({plan.total})
          </PrintLabelsButton>
        )}
      </div>
      {(problems.length > 0 || action.error) && (
        <ul className="space-y-1 text-right text-xs text-warning-text">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
          {action.error && <li className="text-error-text">{action.error}</li>}
        </ul>
      )}
    </div>
  );
}

/** Best-guess category for an item name ("Cotton saree" → Sarees), else the first one. */
function guessCategory(
  itemName: string,
  options: { code: string; name: string }[],
): { code: string; name: string } | undefined {
  const words = itemName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const stem = (w: string) => w.replace(/(es|s)$/, "");
  return (
    options.find((o) =>
      o.name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2)
        .some((cw) => words.some((w) => stem(w) === stem(cw))),
    ) ?? options[0]
  );
}


/* ── Items of one line: TanStack table on ≥ sm, stacked cards on phones (constitution §6) ── */

/** Per-item helpers shared by every cell (offline-first write-through on change / blur). */
function itemActions(item: InventoryItem, ctx: RowContext) {
  const save = (changes: Parameters<typeof updateInventoryItem>[1]) =>
    void updateInventoryItem(item._localId, changes);
  const categoryIdFor = (storeId: string | null, code: string) =>
    storeId ? (ctx.storeCategoryId.get(`${storeId}|${code}`) ?? null) : null;
  const stage = stageOf(item, ctx);
  const frozen = editRule(stage, "name") === "locked";
  /** Save a SKU-field / qty change: a barcoded row asks to reset its barcode first. */
  const saveSkuChange = async (changes: Parameters<typeof updateInventoryItem>[1], what: string) => {
    if (editRule(stage, "size") === "reset" && !(await ctx.confirmReset(item, what))) return false;
    save(changes);
    return true;
  };
  return { save, saveSkuChange, categoryIdFor, stage, frozen };
}

type CellProps = { item: InventoryItem; ctx: RowContext; label?: string };

function TextCell({ item, ctx, label, field }: CellProps & { field: "name" | "color" | "size" }) {
  const { save, saveSkuChange, frozen } = itemActions(item, ctx);
  const [value, setValue] = useState(item[field]);
  const names = { name: "Name", color: "Colour", size: "Size" } as const;
  return (
    <Input
      label={label}
      aria-label={label ? undefined : names[field]}
      value={value}
      disabled={frozen}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        const v = value.trim();
        if (!v || v === item[field]) return setValue(item[field]);
        // Name isn't in the SKU; colour and size are.
        if (field === "name") save({ name: v });
        else if (!(await saveSkuChange({ [field]: v }, `the ${names[field].toLowerCase()}`))) setValue(item[field]);
      }}
    />
  );
}

function QtyCell({ item, ctx, label }: CellProps) {
  const { saveSkuChange, frozen } = itemActions(item, ctx);
  const [qty, setQty] = useState(String(item.quantity));
  useEffect(() => setQty(String(item.quantity)), [item.quantity]);
  return (
    <Input
      label={label}
      aria-label={label ? undefined : "Qty"}
      type="number"
      inputMode="numeric"
      value={qty}
      disabled={frozen}
      onChange={(e) => setQty(e.target.value)}
      onBlur={async () => {
        const n = Math.round(Number(qty));
        if (!(Number.isInteger(n) && n > 0 && n !== item.quantity)) return setQty(String(item.quantity));
        // Qty was booked into org stock with the barcode, so a barcoded row resets first.
        if (!(await saveSkuChange({ quantity: n }, "the quantity"))) setQty(String(item.quantity));
      }}
    />
  );
}

/** MRP stays editable after the SKU exists (reprint the label) until dispatch. Tags read the live input value. */
function MrpCell({ item, ctx, label }: CellProps) {
  const { save, frozen } = itemActions(item, ctx);
  const [mrp, setMrp] = useState(rupees(item.mrp_paise));
  // Reflect external changes (e.g. a bulk MRP edit, a sync pull).
  useEffect(() => setMrp(rupees(item.mrp_paise)), [item.mrp_paise]);
  const mrpPaise = rupeesToPaise(mrp);
  const is18 = mrpPaise != null && mrpPaise > MRP_5_PERCENT_MAX_PAISE;
  const belowLanded =
    item.landed_unit_cost_paise != null && mrpPaise != null && mrpPaise < item.landed_unit_cost_paise;
  return (
    <div>
      <Input
        label={label}
        aria-label={label ? undefined : "MRP (₹)"}
        type="number"
        inputMode="decimal"
        value={mrp}
        disabled={frozen}
        onChange={(e) => setMrp(e.target.value)}
        onBlur={() => {
          if (mrpPaise != null && mrpPaise !== item.mrp_paise) save({ mrp_paise: mrpPaise });
          else setMrp(rupees(item.mrp_paise));
        }}
      />
      {(is18 || belowLanded) && (
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          {is18 && <span className="rounded bg-warning-bg px-1.5 py-0.5 text-warning-text">18% GST</span>}
          {belowLanded && (
            <span className="rounded bg-error-bg px-1.5 py-0.5 text-error-text">Below landed cost</span>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryCell({ item, ctx, label }: CellProps) {
  const { saveSkuChange, categoryIdFor, frozen } = itemActions(item, ctx);
  return (
    <SingleSelect
      label={label}
      aria-label={label ? undefined : "Category"}
      placeholder={null}
      disabled={frozen}
      value={item.category_code}
      onChange={(e) =>
        void saveSkuChange(
          { category_code: e.target.value, category_id: categoryIdFor(item.store_id, e.target.value) },
          "the category",
        )
      }
      options={
        ctx.categoryOptions.length
          ? ctx.categoryOptions.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))
          : [{ value: item.category_code, label: item.category_code }]
      }
    />
  );
}

/** Store picker, plus the "store has no such category → Add it" fix-up. */
function StoreCell({ item, ctx, label }: CellProps) {
  const { save, saveSkuChange, categoryIdFor, frozen } = itemActions(item, ctx);
  const missingCategory = item.store_id != null && categoryIdFor(item.store_id, item.category_code) == null;
  const storeName = ctx.stores.find((s) => s.id === item.store_id)?.name;
  const categoryName = ctx.categoryNameByCode.get(item.category_code) ?? item.category_code;

  const addCategoryToStore = async () => {
    if (!item.store_id) return;
    const created = await createCategory({
      organization_id: ctx.orgId,
      store_id: item.store_id,
      name: categoryName,
      code: item.category_code,
      next_sequence: 1,
    });
    save({ category_id: created.id ?? null });
  };

  return (
    <div>
      <SingleSelect
        label={label}
        aria-label={label ? undefined : "Store"}
        placeholder={null}
        disabled={frozen}
        value={item.store_id ?? UNALLOCATED}
        onChange={(e) => {
          const storeId = e.target.value || null;
          void saveSkuChange(
            { store_id: storeId, category_id: categoryIdFor(storeId, item.category_code) },
            "the store",
          );
        }}
        options={[
          { value: UNALLOCATED, label: "Unallocated (at org)" },
          ...ctx.stores.map((s) => ({
            value: s.id,
            label: s.store_code ? `${s.name} (${s.store_code})` : s.name,
          })),
        ]}
      />
      {missingCategory && (
        <p className="mt-1 text-xs text-warning-text">
          {storeName} has no &ldquo;{categoryName}&rdquo; category.{" "}
          <button type="button" className="font-medium underline" onClick={() => void addCategoryToStore()}>
            Add it
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Where a row's pieces are and its next step: Dispatch N → In transit → Received. Draft/finalized
 * status is shown once per line (header pills), not per row. Drafts and offline rows show "—"
 * (stock numbers come from the server).
 */
function DispatchCell({ item, ctx }: { item: InventoryItem; ctx: RowContext }) {
  const action = useSkuAction();
  const none = <span className="text-xs text-fg-muted">—</span>;
  if (!ctx.holdings) return none;
  if (item.status === "draft") {
    return (
      <div className="text-xs">
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 font-medium text-brand hover:underline disabled:opacity-60"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              const [fresh] = await ensureSkus([item], ctx);
              ctx.onDispatch([fresh._localId]);
            })
          }
        >
          <Truck size={14} /> {action.busy ? "Creating SKU…" : `Dispatch ${item.quantity}`}
        </button>
        {action.error && <p className="text-error-text">{action.error}</p>}
      </div>
    );
  }
  const h = item.id ? ctx.holdings?.get(item.id) : undefined;
  const ts = (item.id && ctx.transfersByItem.get(item.id)) || [];
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name ?? "store";
  const qtyIn = (t: TransferSummary) => t.stock_transfer_items.find((ti) => ti.item_id === item.id);
  const inTransit = ts.filter((t) => t.status === "dispatched");
  const received = ts.filter((t) => t.status === "received");
  const sent = received.reduce((n, t) => n + (qtyIn(t)?.qty_sent ?? 0), 0);
  const got = received.reduce((n, t) => n + (qtyIn(t)?.qty_received ?? 0), 0);
  if (!(h?.atOrg ?? 0) && ts.length === 0) return none;

  return (
    <div className="space-y-1 text-xs">
      {(h?.atOrg ?? 0) > 0 && (
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 font-medium text-brand hover:underline"
          onClick={() => ctx.onDispatch([item._localId])}
        >
          <Truck size={14} /> Dispatch {h!.atOrg}
        </button>
      )}
      {inTransit.map((t) => (
        <p key={t.id} className="flex items-center gap-1 text-fg-muted">
          <Truck size={12} /> {qtyIn(t)?.qty_sent} in transit → {storeName(t.to_store_id)}
        </p>
      ))}
      {received.length > 0 && (
        <p className={cn("flex items-center gap-1 font-medium", got >= sent ? "text-success-text" : "text-warning-text")}>
          <CheckCircle2 size={12} /> Received {got}/{sent}
        </p>
      )}
    </div>
  );
}

/** The item's label: SKU (once created), printed count, Barcode preview and a row Print. */
function LabelInfo({ item, ctx }: { item: InventoryItem; ctx: RowContext }) {
  const stage = stageOf(item, ctx);
  return (
    <div className="mt-2">
      {item.sku ? (
        <p className="font-mono text-sm whitespace-nowrap text-fg">{item.sku}</p>
      ) : (
        <p className="text-xs text-fg-muted">No barcode yet</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3">
        {stage === "printed" && (
          <p className="inline-flex items-center gap-1 text-xs text-success-text">
            <Lock size={12} /> {item.labels_printed} printed
          </p>
        )}
        {stage === "dispatched" && (
          <p className="inline-flex items-center gap-1 text-xs text-fg-muted">
            <Lock size={12} /> Dispatched
          </p>
        )}
        <BarcodeButton item={item} ctx={ctx} />
        <RowPrintButton item={item} ctx={ctx} />
        {stage === "printed" && <UnlockButton item={item} />}
      </div>
    </div>
  );
}

const UNLOCK_REASONS = [
  "Wrong size",
  "Wrong colour",
  "Wrong category",
  "Wrong store",
  "Wrong quantity",
  "Wrong MRP",
  "Wrong name",
  "Other",
];

/** "Unlock to correct…": a printed (not dispatched) row back to editable, with a reason. */
function UnlockButton({ item }: { item: InventoryItem }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const action = useSkuAction();
  const text = reason === "Other" ? other.trim() : reason;
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg hover:underline"
        onClick={() => setOpen(true)}
      >
        <LockOpen size={14} /> Unlock to correct…
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Unlock ${item.sku}?`}>
        <p className="text-sm text-fg">
          {item.labels_printed} label{item.labels_printed === 1 ? " is" : "s are"} printed and probably already
          stuck on the packets.
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          After you change it, <b>remove those stickers</b> and print new ones. Changing its store, category,
          colour, size or qty will also give it a new barcode.
        </p>
        <div className="mt-4 space-y-3">
          <SingleSelect
            label="Reason"
            placeholder="Choose a reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={UNLOCK_REASONS.map((r) => ({ value: r, label: r }))}
          />
          {reason === "Other" && (
            <Input label="What's wrong?" value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} />
          )}
        </div>
        {action.error && <p className="mt-3 text-sm text-error-text">{action.error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!text || action.busy}
            onClick={() =>
              action.run(async () => {
                await unlockItemLabels(item, text);
                setOpen(false);
              })
            }
          >
            <LockOpen size={16} /> {action.busy ? "Unlocking…" : "Unlock"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

type ResetAsk = { item: InventoryItem; what: string; resolve: (ok: boolean) => void };

/** "Reset this barcode?" — shown when a barcoded (unprinted) row's SKU fields / qty change. */
function ResetBarcodeDialog({ ask, onDone }: { ask: ResetAsk | null; onDone: (ok: boolean) => void }) {
  const action = useSkuAction();
  const item = ask?.item;
  return (
    <Modal open={!!ask} onClose={() => onDone(false)} title="Reset this barcode?">
      {item && (
        <>
          <p className="text-sm text-fg">
            <span className="font-mono">{item.sku}</span> already has a barcode (no labels printed yet).
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            Changing {ask.what} makes this barcode wrong, so it will be cancelled. Generate a new barcode
            afterwards — it gets the next number.
          </p>
          {action.error && <p className="mt-3 text-sm text-error-text">{action.error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onDone(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await resetItemSku(item);
                  onDone(true);
                })
              }
            >
              {action.busy ? "Resetting…" : "Reset barcode & save"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Generate and preview the row's barcode label (the org's label size) before printing. */
function BarcodeButton({ item, ctx }: { item: InventoryItem; ctx: RowContext }) {
  const orgId = ctx.orgId;
  const [open, setOpen] = useState(false);
  const action = useSkuAction();
  const layout = useMemo(() => layoutFromPref(orgId), [orgId]);
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline disabled:opacity-60"
        disabled={action.busy || item.status === "retired"}
        onClick={() =>
          action.run(async () => {
            await ensureSkus([item], ctx);
            setOpen(true);
          })
        }
      >
        <Barcode size={14} /> {action.busy ? "Generating…" : item.sku ? "Barcode" : "Generate barcode"}
      </button>
      {action.error && <span className="basis-full text-xs text-error-text">{action.error}</span>}
      <Modal open={open} onClose={() => setOpen(false)} title="Label">
        <div className="flex justify-center rounded-lg bg-surface-2 p-4">
          {/* Labels are printed black-on-white, so the preview stays white in dark mode too. */}
          <div
            className="overflow-hidden rounded border border-dashed border-border bg-white"
            style={{ width: `${layout.labelW}mm`, height: `${layout.labelH}mm`, maxWidth: "100%" }}
          >
            {open && item.sku && (
              <Label
                data={{
                  sku: item.sku!,
                  name: item.name,
                  color: item.color,
                  size: item.size,
                  mrpPaise: item.mrp_paise,
                }}
                w={layout.labelW}
                h={layout.labelH}
              />
            )}
          </div>
        </div>
        <p className="mt-3 text-center font-mono text-sm text-fg">{item.sku}</p>
        <p className="text-center text-xs text-fg-muted">
          QR code · {layout.name} · {item.labels_printed} of {item.quantity} printed
        </p>
        <div className="mt-4 flex justify-center">
          <RowPrintButton item={item} ctx={ctx} />
        </div>
      </Modal>
    </>
  );
}

const ROW_LINK = "inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline";

/** One row's labels: outstanding copies, or a full reprint once they're all printed. */
function RowPrintButton({ item, ctx }: { item: InventoryItem; ctx: RowContext }) {
  const plan = printPlanFor([item]);
  return (
    <PrintLabelsButton
      orgId={ctx.orgId}
      entries={plan.entries}
      prepare={preparePrint([item], ctx)}
      disabled={plan.total === 0}
      className={ROW_LINK}
    >
      <Printer size={14} /> {plan.reprint ? "Reprint" : "Print"} {plan.total}
    </PrintLabelsButton>
  );
}


function RemoveButton({ item, ctx, compact }: { item: InventoryItem; ctx: RowContext; compact?: boolean }) {
  const stage = stageOf(item, ctx);
  if (stage !== "draft" && stage !== "barcoded") return null;
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-fg-muted hover:text-red-500"
      onClick={async () => {
        if (stage === "barcoded" && !(await ctx.confirmReset(item, "this item (remove it)"))) return;
        void deleteInventoryItem(item._localId);
      }}
      aria-label={`Remove ${item.name} ${item.color} ${item.size}`}
    >
      <Trash2 size={14} />
      {!compact && "Remove"}
    </button>
  );
}

/**
 * Sticky styles for a pinned column (checkbox + Name stay fixed while the rest scrolls).
 * `getStart` offsets come from each column's `size`, so pinned cells must render at exactly
 * that width — otherwise a gap opens before Name and Name overlaps Category.
 */
function pinningStyles<T>(column: Column<T>): CSSProperties {
  const pinned = column.getIsPinned();
  if (!pinned) return {};
  const width = `${column.getSize()}px`;
  return {
    position: "sticky",
    left: `${column.getStart("left")}px`,
    zIndex: 1,
    width,
    minWidth: width,
    maxWidth: width,
  };
}

type GroupedProps = {
  lines: LineEntry[];
  ctx: RowContext;
  memberId: string | null;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (s: RowSelectionState) => void;
  collapsed: Record<string, boolean>;
  onToggleLine: (key: string) => void;
};

/** Table rows: one group row per invoice line, its items as sub-rows. */
type TableRow = { kind: "group"; entry: LineEntry; items: TableRow[] } | { kind: "item"; item: InventoryItem };

/**
 * ≥ sm: ONE table for the whole invoice, grouped by invoice line (open by default). The group
 * row carries the line summary + its actions; its checkbox ticks the line's items.
 */
function InvoiceTable({
  lines,
  ctx,
  memberId,
  rowSelection,
  onRowSelectionChange,
  collapsed,
  onToggleLine,
}: GroupedProps) {
  const data = useMemo<TableRow[]>(
    () =>
      lines.map((entry) => ({
        kind: "group" as const,
        entry,
        items: entry.items.map((item) => ({ kind: "item" as const, item })),
      })),
    [lines],
  );
  const itemOf = (r: TableRow) => (r.kind === "item" ? r.item : null)!;

  const columns = useMemo<ColumnDef<TableRow>[]>(
    () => [
      {
        id: "select",
        size: 64, // 44px tap target + cell padding
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all items"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${itemOf(row.original).name} ${itemOf(row.original).color} ${itemOf(row.original).size}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        id: "name",
        header: "Name",
        size: 208,
        cell: ({ row }) => <TextCell item={itemOf(row.original)} ctx={ctx} field="name" />,
      },
      {
        id: "category",
        header: "Category",
        meta: { className: "min-w-44" },
        cell: ({ row }) => <CategoryCell item={itemOf(row.original)} ctx={ctx} />,
      },
      {
        id: "color",
        header: "Colour",
        meta: { className: "w-28 min-w-28" },
        cell: ({ row }) => <TextCell item={itemOf(row.original)} ctx={ctx} field="color" />,
      },
      {
        id: "size",
        header: "Size",
        meta: { className: "w-24 min-w-24" },
        cell: ({ row }) => <TextCell item={itemOf(row.original)} ctx={ctx} field="size" />,
      },
      {
        id: "qty",
        header: "Qty",
        meta: { className: "w-24 min-w-24" },
        cell: ({ row }) => <QtyCell item={itemOf(row.original)} ctx={ctx} />,
      },
      {
        id: "mrp",
        header: "MRP (₹)",
        meta: { className: "w-32 min-w-32" },
        cell: ({ row }) => <MrpCell item={itemOf(row.original)} ctx={ctx} />,
      },
      {
        id: "store",
        header: "Store",
        meta: { className: "min-w-52" },
        cell: ({ row }) => <StoreCell item={itemOf(row.original)} ctx={ctx} />,
      },
      {
        id: "dispatch",
        header: "Dispatch",
        meta: { className: "min-w-44" },
        // mt-1 lines the first line up with the inputs in the neighbouring cells.
        cell: ({ row }) => (
          <div className="mt-1 flex min-h-11 flex-col justify-center">
            <DispatchCell item={itemOf(row.original)} ctx={ctx} />
          </div>
        ),
      },
      {
        id: "label",
        header: "Label",
        meta: { className: "min-w-64" },
        cell: ({ row }) => <LabelInfo item={itemOf(row.original)} ctx={ctx} />,
      },
      {
        id: "remove",
        header: "",
        meta: { className: "w-12" },
        cell: ({ row }) => <RemoveButton item={itemOf(row.original)} ctx={ctx} compact />,
      },
    ],
    [ctx],
  );

  const table = useReactTable({
    data,
    columns,
    // Stable row ids keep each cell's in-progress input state across re-renders.
    getRowId: (r) => (r.kind === "group" ? groupRowId(r.entry.key) : r.item._localId),
    getSubRows: (r) => (r.kind === "group" ? r.items : undefined),
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableRowSelection: (row) => row.original.kind === "item" || row.subRows.length > 0,
    state: {
      rowSelection,
      expanded: Object.fromEntries(lines.map((l) => [groupRowId(l.key), !collapsed[l.key]])),
    },
    onRowSelectionChange: (updater) =>
      onRowSelectionChange(typeof updater === "function" ? updater(rowSelection) : updater),
    initialState: { columnPinning: { left: ["select", "name"] } },
  });

  const colClass = (c: Column<TableRow>) => (c.columnDef.meta as { className?: string } | undefined)?.className;
  const colCount = table.getVisibleLeafColumns().length;

  // Visible width of the horizontal scroll area (group rows are sized to it).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={scrollRef} className="hidden overflow-x-auto rounded-lg border border-border sm:block">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="text-left text-xs font-medium text-fg-muted">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  style={pinningStyles(header.column)}
                  className={cn(
                    "isolate bg-surface-2 px-2 py-2 first:pl-3 last:pr-3",
                    colClass(header.column),
                    header.column.getIsLastColumn("left") && "border-r border-border",
                  )}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            if (row.original.kind === "group") {
              const entry = row.original.entry;
              const open = row.getIsExpanded();
              return (
                <tr key={row.id}>
                  <td colSpan={colCount} className="border-t border-border bg-surface-2/60 p-0">
                    {/* Sticky and exactly as wide as the visible scroll area, so the line summary sits
                        left and its status + actions sit at the visible right edge while columns scroll. */}
                    <div
                      className="sticky left-0 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2 pr-3 pl-3"
                      style={viewWidth ? { width: viewWidth } : undefined}
                    >
                      <div className="flex min-w-0 items-start">
                        <Checkbox
                          aria-label={`Select all items of ${entry.line.item.description}`}
                          disabled={row.subRows.length === 0}
                          checked={row.getIsAllSubRowsSelected()}
                          indeterminate={row.getIsSomeSelected()}
                          onChange={row.getToggleSelectedHandler()}
                        />
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={open ? "Collapse" : "Expand"}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center text-fg-muted hover:text-fg"
                          onClick={() => onToggleLine(entry.key)}
                        >
                          <ChevronDown size={18} className={cn("transition-transform", !open && "-rotate-90")} />
                        </button>
                        <div className="pt-1.5">
                          <LineSummary entry={entry} />
                        </div>
                      </div>
                      <LineActions
                        entry={entry}
                        ctx={ctx}
                        memberId={memberId}
                        align="end"
                        leading={<FinalizedPill entry={entry} />}
                      />
                    </div>
                    {open && entry.items.length === 0 && (
                      <p className="border-t border-border bg-surface px-3 py-3 text-sm text-fg-muted">
                        Not catalogued yet. Add one item per colour × size (and store).
                      </p>
                    )}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={row.id} className="align-top">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={pinningStyles(cell.column)}
                    className={cn(
                      // `isolate`: each cell is its own stacking context, so a control's z-index
                      // (SingleSelect is z-20/z-30) can't paint over the pinned cells when it scrolls
                      // underneath them.
                      "isolate border-t border-border px-2 py-2 first:pl-3 last:pr-3",
                      // Opaque backgrounds only: the pinned checkbox + Name cells sit over the columns
                      // scrolling underneath them. (`bg-bg-elevated` isn't a defined token → transparent.)
                      row.getIsSelected() ? "bg-brand-subtle-bg" : "bg-surface",
                      colClass(cell.column),
                      cell.column.getIsLastColumn("left") && "border-r border-border",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** < sm: an accordion — one collapsible section per invoice line (open by default). */
function InvoiceAccordion({
  lines,
  ctx,
  memberId,
  rowSelection,
  onRowSelectionChange,
  collapsed,
  onToggleLine,
}: GroupedProps) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border sm:hidden">
      {lines.map((entry) => {
        const open = !collapsed[entry.key];
        const ids = entry.items.map((i) => i._localId);
        const count = ids.filter((id) => rowSelection[id]).length;
        const toggleAll = () => {
          const next = { ...rowSelection };
          for (const id of ids) {
            if (count === ids.length) delete next[id];
            else next[id] = true;
          }
          onRowSelectionChange(next);
        };
        return (
          <section key={entry.key}>
            <div className="flex items-start bg-surface-2/60 py-1 pr-1">
              <Checkbox
                aria-label={`Select all items of ${entry.line.item.description}`}
                disabled={ids.length === 0}
                checked={ids.length > 0 && count === ids.length}
                indeterminate={count > 0 && count < ids.length}
                onChange={toggleAll}
              />
              <button
                type="button"
                aria-expanded={open}
                className="flex min-h-11 flex-1 items-start justify-between gap-2 py-2 text-left"
                onClick={() => onToggleLine(entry.key)}
              >
                <LineSummary entry={entry} withFinalized />
                <ChevronDown
                  size={18}
                  className={cn("mt-0.5 shrink-0 text-fg-muted transition-transform", !open && "-rotate-90")}
                />
              </button>
            </div>
            {open && (
              <div className="space-y-3 p-3">
                <LineActions entry={entry} ctx={ctx} memberId={memberId} />
                {entry.items.length === 0 ? (
                  <p className="text-sm text-fg-muted">Not catalogued yet. Add one item per colour × size (and store).</p>
                ) : (
                  <ItemCards
                    items={entry.items}
                    ctx={ctx}
                    rowSelection={rowSelection}
                    onRowSelectionChange={onRowSelectionChange}
                  />
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

type SelectionProps = {
  items: InventoryItem[];
  ctx: RowContext;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (s: RowSelectionState) => void;
};

/** Phones (< sm): one stacked card per item — the wide table is unreadable at 375px. */
function ItemCards({ items, ctx, rowSelection, onRowSelectionChange }: SelectionProps) {
  const toggle = (id: string) => {
    const next = { ...rowSelection };
    if (next[id]) delete next[id];
    else next[id] = true;
    onRowSelectionChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div
          key={it._localId}
          className={cn(
            "rounded-lg border p-3",
            rowSelection[it._localId] ? "border-brand bg-brand-subtle-bg" : "border-border bg-surface",
          )}
        >
          <div className="-mt-2 -ml-2 flex items-center justify-between">
            <Checkbox
              aria-label={`Select ${it.name} ${it.color} ${it.size}`}
              checked={!!rowSelection[it._localId]}
              onChange={() => toggle(it._localId)}
            />
          </div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-xs text-fg-muted">Dispatch</span>
            <DispatchCell item={it} ctx={ctx} />
          </div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-xs text-fg-muted">Label</span>
            <LabelInfo item={it} ctx={ctx} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <TextCell item={it} ctx={ctx} field="name" label="Name" />
            </div>
            <div className="col-span-2">
              <CategoryCell item={it} ctx={ctx} label="Category" />
            </div>
            <TextCell item={it} ctx={ctx} field="color" label="Colour" />
            <TextCell item={it} ctx={ctx} field="size" label="Size" />
            <QtyCell item={it} ctx={ctx} label="Qty" />
            <MrpCell item={it} ctx={ctx} label="MRP (₹)" />
            <div className="col-span-2">
              <StoreCell item={it} ctx={ctx} label="Store" />
            </div>
          </div>
          <div className="mt-1 flex justify-end">
            <RemoveButton item={it} ctx={ctx} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Checkbox inside a 44px tap target; supports the "some selected" indeterminate state. */
function Checkbox({
  indeterminate = false,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !rest.checked;
  }, [indeterminate, rest.checked]);
  return (
    <span className="inline-flex min-h-11 min-w-11 items-center justify-center">
      <input ref={ref} type="checkbox" className="size-4 cursor-pointer accent-brand" {...rest} />
    </span>
  );
}
