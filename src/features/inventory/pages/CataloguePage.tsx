import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import {
  type Column,
  type ColumnDef,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Barcode, Lock, Plus, Printer, Trash2 } from "lucide-react";
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
import { finalizeItems, markLabelsPrinted } from "../distribution";
import { Label, LabelSheet } from "../LabelPrint";
import { layoutFromPref, paginateLabels } from "../labels";

/**
 * Catalogue one Ready-for-Inventory invoice (specs/roadmap/inventory.md §3 A–C, §4, §6):
 * split each received line into items (name · category · colour · size · qty · MRP · store),
 * and price them from landed cost. Org-only (inventory.manage). The lot forecast card was
 * removed for now (founder, 2026-09-28); `lotForecast` stays in lib/mrpPricing.ts.
 * Finalize (Phase 2C) asks the server to number SKUs; after that an item's store, category,
 * colour and size are fixed (MRP stays editable — reprint the label) and labels can be printed.
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
  const cataloguedPieces = items.reduce((n, i) => n + i.quantity, 0);
  const totalReceived = entry.lines.reduce((s, l) => s + l.receivedQty, 0);

  const ctx: RowContext = {
    orgId,
    stores: stores ?? [],
    categoryOptions,
    storeCategoryId,
    categoryNameByCode: new Map(categoryOptions.map((c) => [c.code, c.name])),
  };

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

      {entry.lines.map((line) => (
        <LineCard
          key={line.item._localId}
          line={line}
          items={items.filter((i) => i.source_invoice_item_id === line.item.id)}
          catalogued={catalogued.get(line.item.id ?? "") ?? 0}
          suggestedMrp={
            line.landedUnitCostPaise != null
              ? suggestMrpPaise({
                  landedUnitCostPaise: line.landedUnitCostPaise,
                  isTrending: line.item.is_trending,
                  margin,
                  rounding: SUGGESTED_MRP_ROUNDING,
                })
              : 0
          }
          memberId={member?.id ?? null}
          ctx={ctx}
        />
      ))}

      <p className="text-xs text-fg-muted">
        Items are drafts until Finalize, which generates SKUs and unlocks label printing. Drafts
        save as you go and work offline; Finalize needs a connection.
      </p>
    </div>
  );
}

/**
 * Finalize drafts → server-numbered SKUs. Reports anything the server would reject (missing
 * store category, zero MRP) so the owner fixes it in the table instead of reading an error.
 */
function useFinalize(items: InventoryItem[], ctx: RowContext) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drafts = items.filter((i) => i.status === "draft");
  const problems = [
    ...new Set(
      drafts.flatMap((i) => {
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

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await finalizeItems(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    drafts,
    pieces: drafts.reduce((n, i) => n + i.quantity, 0),
    problems,
    busy,
    error,
    canRun: !busy && drafts.length > 0 && problems.length === 0,
    run,
  };
}

type PrintEntry = { item: InventoryItem; copies: number };

/**
 * What a Print click prints for `items` (finalized ones only, one label per piece): the labels
 * still outstanding, or — once everything is printed — a full reprint.
 */
function printPlanFor(items: InventoryItem[]): { entries: PrintEntry[]; total: number; reprint: boolean } {
  const finalized = items.filter((i) => i.status === "finalized" && i.sku);
  const outstanding = finalized
    .map((item) => ({ item, copies: Math.max(0, item.quantity - item.labels_printed) }))
    .filter((e) => e.copies > 0);
  const reprint = outstanding.length === 0;
  const entries = reprint ? finalized.map((item) => ({ item, copies: item.quantity })) : outstanding;
  return { entries, total: entries.reduce((n, e) => n + e.copies, 0), reprint };
}

const OUTLINE_BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

interface RowContext {
  orgId: string;
  stores: { id: string; name: string; store_code: string | null }[];
  categoryOptions: { code: string; name: string }[];
  storeCategoryId: Map<string, string>;
  categoryNameByCode: Map<string, string>;
}

function LineCard({
  line,
  items,
  catalogued,
  suggestedMrp,
  memberId,
  ctx,
}: {
  line: ReadyLine;
  items: InventoryItem[];
  catalogued: number;
  suggestedMrp: number;
  memberId: string | null;
  ctx: RowContext;
}) {
  const remaining = line.receivedQty - catalogued;
  // Shared by the table (≥ sm) and the cards (< sm); keyed by item _localId.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selected = items.filter((i) => rowSelection[i._localId]);
  // Selection only changes what the action buttons act on (print / finalize — more later).
  const selectedDrafts = selected.filter((i) => i.status === "draft");
  const finalize = useFinalize(selectedDrafts.length ? selectedDrafts : items, ctx);
  const lineHasDrafts = items.some((i) => i.status === "draft");
  // Print targets the selected finalized rows; with none selected, the whole line — but only
  // once every item is finalized.
  const selectedFinalized = selected.filter((i) => i.status === "finalized");
  const printTarget = selectedFinalized.length
    ? selectedFinalized
    : !lineHasDrafts
      ? items
      : [];
  const plan = printPlanFor(printTarget);

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
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-fg">{line.item.description}</p>
          <p className="text-xs text-fg-muted">
            {line.receivedQty} pcs received · landed{" "}
            {line.landedUnitCostPaise != null ? formatInr(line.landedUnitCostPaise) : "—"}/pc ·
            suggested MRP {formatInr(suggestedMrp)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                remaining === 0
                  ? "bg-success-bg text-success-text"
                  : remaining < 0
                    ? "bg-error-bg text-error-text"
                    : "bg-warning-bg text-warning-text"
              }`}
            >
              {catalogued} of {line.receivedQty} catalogued
              {remaining < 0 ? ` · ${-remaining} too many` : ""}
            </span>
            {items.length > 0 && !lineHasDrafts && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success-text">
                <Lock size={12} /> All finalized
              </span>
            )}
          </div>
        </div>
      </div>

      {(finalize.problems.length > 0 || finalize.error) && (
        <div className="mt-3 text-xs">
          {finalize.problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-warning-text">
              {finalize.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {finalize.error && <p className="mt-2 text-sm text-error-text">{finalize.error}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={addItem}>
          <Plus size={16} />
          Add item{remaining > 0 ? ` (${remaining} left)` : ""}
        </Button>
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {finalize.drafts.length > 0 && (
              <Button type="button" size="sm" onClick={finalize.run} disabled={!finalize.canRun}>
                <Lock size={16} />
                {finalize.busy
                  ? "Finalizing…"
                  : `Finalize ${selectedDrafts.length ? "selected" : finalize.drafts.length} · ${finalize.pieces} pcs`}
              </Button>
            )}
            <PrintLabelsButton
              orgId={ctx.orgId}
              entries={plan.entries}
              className={OUTLINE_BUTTON}
              title={plan.total === 0 ? "Finalize all items, or select finalized rows" : undefined}
            >
              <Printer size={16} />
              {selectedFinalized.length
                ? `Print selected (${plan.total})`
                : `${plan.reprint && plan.total > 0 ? "Reprint" : "Print"} labels${plan.total ? ` (${plan.total})` : ""}`}
            </PrintLabelsButton>
          </div>
        )}
      </div>

      <div className="mt-3">
        {items.length > 0 ? (
          <>
            <ItemsTable
              items={items}
              ctx={ctx}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            />
            <ItemCards
              items={items}
              ctx={ctx}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            />
          </>
        ) : (
          <p className="text-sm text-fg-muted">
            Not catalogued yet. Add one item per colour × size (and store).
          </p>
        )}
      </div>
    </Card>
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
  return { save, categoryIdFor, locked: item.status !== "draft" };
}

type CellProps = { item: InventoryItem; ctx: RowContext; label?: string };

function TextCell({ item, ctx, label, field }: CellProps & { field: "name" | "color" | "size" }) {
  const { save, locked } = itemActions(item, ctx);
  const [value, setValue] = useState(item[field]);
  const names = { name: "Name", color: "Colour", size: "Size" } as const;
  return (
    <Input
      label={label}
      aria-label={label ? undefined : names[field]}
      value={value}
      disabled={locked}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const v = value.trim();
        if (v && v !== item[field]) save({ [field]: v });
        else setValue(item[field]);
      }}
    />
  );
}

function QtyCell({ item, ctx, label }: CellProps) {
  const { save, locked } = itemActions(item, ctx);
  const [qty, setQty] = useState(String(item.quantity));
  useEffect(() => setQty(String(item.quantity)), [item.quantity]);
  return (
    <Input
      label={label}
      aria-label={label ? undefined : "Qty"}
      type="number"
      inputMode="numeric"
      value={qty}
      disabled={locked}
      onChange={(e) => setQty(e.target.value)}
      onBlur={() => {
        const n = Math.round(Number(qty));
        if (Number.isInteger(n) && n > 0 && n !== item.quantity) save({ quantity: n });
        else setQty(String(item.quantity));
      }}
    />
  );
}

/** MRP stays editable after Finalize (reprint the label). Tags read the live input value. */
function MrpCell({ item, ctx, label }: CellProps) {
  const { save } = itemActions(item, ctx);
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
  const { save, categoryIdFor, locked } = itemActions(item, ctx);
  return (
    <SingleSelect
      label={label}
      aria-label={label ? undefined : "Category"}
      placeholder={null}
      disabled={locked}
      value={item.category_code}
      onChange={(e) =>
        save({ category_code: e.target.value, category_id: categoryIdFor(item.store_id, e.target.value) })
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
  const { save, categoryIdFor, locked } = itemActions(item, ctx);
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
        disabled={locked}
        value={item.store_id ?? UNALLOCATED}
        onChange={(e) => {
          const storeId = e.target.value || null;
          save({ store_id: storeId, category_id: categoryIdFor(storeId, item.category_code) });
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

function StatusBadge({ item }: { item: InventoryItem }) {
  const finalized = item.status !== "draft";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        finalized ? "bg-success-bg text-success-text" : "bg-surface-2 text-fg-muted",
      )}
    >
      {finalized && <Lock size={12} />}
      {finalized ? "Finalized" : "Draft"}
    </span>
  );
}

/** The item's label: SKU once Finalize has generated it, printed count, and a row Print. */
function LabelInfo({ item, orgId }: { item: InventoryItem; orgId: string }) {
  if (!item.sku) return <p className="mt-3 text-xs text-fg-muted">— after Finalize</p>;
  return (
    <div className="mt-2">
      <p className="font-mono text-sm whitespace-nowrap text-fg">{item.sku}</p>
      <div className="flex flex-wrap items-center gap-x-3">
        {item.labels_printed > 0 && (
          <p className="text-xs text-success-text">{item.labels_printed} printed</p>
        )}
        <BarcodeButton item={item} orgId={orgId} />
        <RowPrintButton item={item} orgId={orgId} />
      </div>
    </div>
  );
}

/** Generate and preview the row's barcode label (the org's label size) before printing. */
function BarcodeButton({ item, orgId }: { item: InventoryItem; orgId: string }) {
  const [open, setOpen] = useState(false);
  const layout = useMemo(() => layoutFromPref(orgId), [orgId]);
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline"
        onClick={() => setOpen(true)}
      >
        <Barcode size={14} /> Barcode
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Barcode label">
        <div className="flex justify-center rounded-lg bg-surface-2 p-4">
          {/* Labels are printed black-on-white, so the preview stays white in dark mode too. */}
          <div
            className="overflow-hidden rounded border border-dashed border-border bg-white"
            style={{ width: `${layout.labelW}mm`, height: `${layout.labelH}mm`, maxWidth: "100%" }}
          >
            {open && (
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
          Code 128 · {layout.name} · {item.labels_printed} of {item.quantity} printed
        </p>
        <div className="mt-4 flex justify-center">
          <RowPrintButton item={item} orgId={orgId} />
        </div>
      </Modal>
    </>
  );
}

const ROW_LINK = "inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline";

/** One row's labels: outstanding copies, or a full reprint once they're all printed. */
function RowPrintButton({ item, orgId }: { item: InventoryItem; orgId: string }) {
  const plan = printPlanFor([item]);
  return (
    <PrintLabelsButton orgId={orgId} entries={plan.entries} className={ROW_LINK}>
      <Printer size={14} /> {plan.reprint ? "Reprint" : "Print"} {plan.total}
    </PrintLabelsButton>
  );
}

/**
 * Print labels straight to the browser's print dialog (no Labels screen), with the org's
 * last-used layout. The browser can't tell a real print from a cancelled dialog, so the owner
 * confirms before labels_printed goes up. Disabled when there's nothing to print.
 */
function PrintLabelsButton({
  orgId,
  entries,
  className,
  title,
  children,
}: {
  orgId: string;
  entries: PrintEntry[];
  className: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<"idle" | "printing" | "confirm">("idle");
  // Freeze what was sent to the printer: the counts shift once "Mark done" updates items.
  const [printed, setPrinted] = useState<PrintEntry[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutFromPref(orgId), [orgId]);
  const print = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: "Labels",
    pageStyle: `@page { size: ${layout.pageW}mm ${layout.pageH}mm; margin: 0 } html, body { margin: 0; padding: 0 }`,
    onAfterPrint: () => setPhase("confirm"),
  });
  // Only render the (barcode-heavy) sheet while printing; print once it has mounted.
  useEffect(() => {
    if (phase === "printing") print();
  }, [phase, print]);

  if (phase === "confirm") {
    return (
      <span className="inline-flex min-h-11 items-center gap-2 text-xs">
        <span className="text-fg-muted">Printed OK?</span>
        <button
          type="button"
          className="font-medium text-success-text hover:underline"
          onClick={async () => {
            await markLabelsPrinted(printed.map((e) => ({ item: e.item, labels: e.copies })));
            setPhase("idle");
          }}
        >
          Mark done
        </button>
        <button type="button" className="text-fg-muted hover:underline" onClick={() => setPhase("idle")}>
          No
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        title={title}
        disabled={entries.length === 0 || phase === "printing"}
        onClick={() => {
          setPrinted(entries);
          setPhase("printing");
        }}
      >
        {phase === "printing" ? "Printing…" : children}
      </button>
      {phase === "printing" && (
        <LabelSheet
          sheetRef={sheetRef}
          layout={layout}
          pages={paginateLabels(
            printed.map((e) => ({
              copies: e.copies,
              label: {
                sku: e.item.sku!,
                name: e.item.name,
                color: e.item.color,
                size: e.item.size,
                mrpPaise: e.item.mrp_paise,
              },
            })),
            layout,
          )}
        />
      )}
    </>
  );
}

function RemoveButton({ item, compact }: { item: InventoryItem; compact?: boolean }) {
  if (item.status !== "draft") return null;
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-fg-muted hover:text-red-500"
      onClick={() => void deleteInventoryItem(item._localId)}
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

type SelectionProps = {
  items: InventoryItem[];
  ctx: RowContext;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (s: RowSelectionState) => void;
};

function ItemsTable({ items, ctx, rowSelection, onRowSelectionChange }: SelectionProps) {
  const columns = useMemo<ColumnDef<InventoryItem>[]>(
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
            aria-label={`Select ${row.original.name} ${row.original.color} ${row.original.size}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        id: "name",
        header: "Name",
        size: 208,
        cell: ({ row }) => <TextCell item={row.original} ctx={ctx} field="name" />,
      },
      {
        id: "category",
        header: "Category",
        meta: { className: "min-w-44" },
        cell: ({ row }) => <CategoryCell item={row.original} ctx={ctx} />,
      },
      {
        id: "color",
        header: "Colour",
        meta: { className: "w-28 min-w-28" },
        cell: ({ row }) => <TextCell item={row.original} ctx={ctx} field="color" />,
      },
      {
        id: "size",
        header: "Size",
        meta: { className: "w-24 min-w-24" },
        cell: ({ row }) => <TextCell item={row.original} ctx={ctx} field="size" />,
      },
      {
        id: "qty",
        header: "Qty",
        meta: { className: "w-24 min-w-24" },
        cell: ({ row }) => <QtyCell item={row.original} ctx={ctx} />,
      },
      {
        id: "mrp",
        header: "MRP (₹)",
        meta: { className: "w-32 min-w-32" },
        cell: ({ row }) => <MrpCell item={row.original} ctx={ctx} />,
      },
      {
        id: "store",
        header: "Store",
        meta: { className: "min-w-52" },
        cell: ({ row }) => <StoreCell item={row.original} ctx={ctx} />,
      },
      {
        id: "status",
        header: "Status",
        meta: { className: "w-28 min-w-28" },
        // mt-3 lines the badge up with the inputs in the neighbouring cells.
        cell: ({ row }) => (
          <div className="mt-3">
            <StatusBadge item={row.original} />
          </div>
        ),
      },
      {
        id: "label",
        header: "Label",
        meta: { className: "min-w-64" },
        cell: ({ row }) => <LabelInfo item={row.original} orgId={ctx.orgId} />,
      },
      {
        id: "remove",
        header: "",
        meta: { className: "w-12" },
        cell: ({ row }) => <RemoveButton item={row.original} compact />,
      },
    ],
    [ctx],
  );

  const table = useReactTable({
    data: items,
    columns,
    // Stable row ids keep each cell's in-progress input state across re-renders.
    getRowId: (it) => it._localId,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    state: { rowSelection },
    onRowSelectionChange: (updater) =>
      onRowSelectionChange(typeof updater === "function" ? updater(rowSelection) : updater),
    initialState: { columnPinning: { left: ["select", "name"] } },
  });

  const colClass = (c: Column<InventoryItem>) =>
    (c.columnDef.meta as { className?: string } | undefined)?.className;

  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="text-left text-xs font-medium text-fg-muted">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  style={pinningStyles(header.column)}
                  className={cn(
                    "bg-surface-2 px-2 py-2 first:pl-3 last:pr-3",
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
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="align-top">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={pinningStyles(cell.column)}
                  className={cn(
                    "border-t border-border px-2 py-2 first:pl-3 last:pr-3",
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phones (< sm): one stacked card per item — the wide table is unreadable at 375px. */
function ItemCards({ items, ctx, rowSelection, onRowSelectionChange }: SelectionProps) {
  const count = items.filter((i) => rowSelection[i._localId]).length;
  const toggle = (id: string) => {
    const next = { ...rowSelection };
    if (next[id]) delete next[id];
    else next[id] = true;
    onRowSelectionChange(next);
  };
  return (
    <div className="space-y-3 sm:hidden">
      <label className="flex items-center gap-1 text-sm text-fg-muted">
        <Checkbox
          checked={count === items.length}
          indeterminate={count > 0 && count < items.length}
          onChange={() =>
            onRowSelectionChange(
              count === items.length ? {} : Object.fromEntries(items.map((i) => [i._localId, true])),
            )
          }
        />
        Select all
      </label>
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
            <StatusBadge item={it} />
          </div>
          {it.sku && (
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-xs text-fg-muted">Label</span>
              <LabelInfo item={it} orgId={ctx.orgId} />
            </div>
          )}
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
            <RemoveButton item={it} />
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
