import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Lock, Plus, Printer, Trash2 } from "lucide-react";
import type { InventoryItem, PurchaseInvoice } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeading } from "@/components/ui/PageHeading";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { useMember } from "@/features/auth/useMember";
import { hasPermission, useEntitlements } from "@/features/auth/entitlements";
import { useStoresByOrg } from "@/features/stores/stores";
import { formatInr, rupeesToPaise } from "@/lib/money";
import type { MarginConfig, MarginRecipe } from "@/lib/purchaseMargin";
import {
  MRP_5_PERCENT_MAX_PAISE,
  MRP_ROUNDING_OPTIONS,
  lotForecast,
  roundMrpPaise,
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
import { finalizeItems } from "../distribution";

/**
 * Catalogue one Ready-for-Inventory invoice (specs/roadmap/inventory.md §3 A–C, §4, §6):
 * split each received line into items (name · category · colour · size · qty · MRP · store),
 * price them from landed cost, and watch the lot forecast. Org-only (inventory.manage).
 * Finalize (Phase 2C) asks the server to number SKUs; after that an item's store, category,
 * colour and size are fixed (MRP stays editable — reprint the label) and labels can be printed.
 */

const ROUNDING_KEY = (orgId: string) => `tt:mrp-rounding:${orgId}`;

function readRounding(orgId: string): MrpRounding {
  try {
    const v = localStorage.getItem(ROUNDING_KEY(orgId));
    if (v && MRP_ROUNDING_OPTIONS.some((o) => o.value === v)) return v as MrpRounding;
  } catch {
    /* storage unavailable — fall back to the default */
  }
  return "end99";
}

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

  const [rounding, setRounding] = useState<MrpRounding>(() => readRounding(orgId ?? ""));
  useEffect(() => {
    try {
      localStorage.setItem(ROUNDING_KEY(orgId ?? ""), rounding);
    } catch {
      /* ignore */
    }
  }, [orgId, rounding]);

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
  const forecast = lotForecast(
    items.map((i) => ({
      quantity: i.quantity,
      mrpPaise: i.mrp_paise,
      landedUnitCostPaise: i.landed_unit_cost_paise ?? 0,
    })),
  );
  const totalReceived = entry.lines.reduce((s, l) => s + l.receivedQty, 0);

  const roundAll = async () => {
    for (const it of items) {
      if (it.status !== "draft") continue;
      const next = roundMrpPaise(it.mrp_paise, rounding);
      if (next !== it.mrp_paise) await updateInventoryItem(it._localId, { mrp_paise: next });
    }
  };

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
        {forecast.pieces} of {totalReceived} pieces catalogued
      </p>

      <Card title="Lot forecast" desc="MRP includes GST, so margin is shown net of GST.">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <Stat label="Pieces" value={String(forecast.pieces)} />
          <Stat label="Revenue (at MRP)" value={formatInr(forecast.revenuePaise)} />
          <Stat label="GST inside MRP" value={formatInr(forecast.gstPaise)} />
          <Stat label="Landed cost" value={formatInr(forecast.landedPaise)} />
          <Stat
            label="Margin"
            value={`${formatInr(forecast.marginPaise)}${
              forecast.marginPct != null ? ` · ${Math.round(forecast.marginPct * 100)}%` : ""
            }`}
            tone={forecast.marginPaise < 0 ? "bad" : "good"}
          />
        </dl>
        {forecast.lines18Percent > 0 && (
          <p className="mt-3 text-xs text-amber-600">
            {forecast.lines18Percent} item{forecast.lines18Percent === 1 ? " is" : "s are"} priced
            above ₹2,625, so GST there is 18% instead of 5%.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="w-full sm:w-72">
            <SingleSelect
              label="MRP rounding"
              placeholder={null}
              value={rounding}
              onChange={(e) => setRounding(e.target.value as MrpRounding)}
              options={MRP_ROUNDING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <Button type="button" variant="ghost" onClick={roundAll} disabled={rounding === "none"}>
            Round all MRPs
          </Button>
        </div>
      </Card>

      <FinalizeCard orgId={orgId} items={items} ctx={ctx} />

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
                  rounding,
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
 * Finalize drafts → server-numbered SKUs. Blocks on anything the server would reject (missing
 * store category, zero MRP) so the owner fixes it here instead of reading an error.
 */
function FinalizeCard({ orgId, items, ctx }: { orgId: string; items: InventoryItem[]; ctx: RowContext }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drafts = items.filter((i) => i.status === "draft");
  const finalized = items.filter((i) => i.status === "finalized");
  const problems = drafts.flatMap((i) => {
    const out: string[] = [];
    if (i.mrp_paise <= 0) out.push(`${i.name} ${i.color} ${i.size}: set an MRP`);
    if (i.store_id && !ctx.storeCategoryId.get(`${i.store_id}|${i.category_code}`)) {
      const store = ctx.stores.find((s) => s.id === i.store_id)?.name ?? "The store";
      out.push(`${store} has no “${ctx.categoryNameByCode.get(i.category_code) ?? i.category_code}” category`);
    }
    if (i.store_id && !ctx.stores.find((s) => s.id === i.store_id)?.store_code) {
      out.push(`${ctx.stores.find((s) => s.id === i.store_id)?.name ?? "The store"} has no store code`);
    }
    return out;
  });
  const uniqueProblems = [...new Set(problems)];
  const pieces = drafts.reduce((n, i) => n + i.quantity, 0);
  const labelsLink = `/org/${orgId}/inventory/labels?items=${finalized.map((i) => `${i.id}:${i.quantity}`).join(",")}`;

  const finalize = async () => {
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

  return (
    <Card
      title="Finalize & labels"
      desc="Finalize numbers each item's SKU (store · category · colour · size · sequence). After that only the MRP can change."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={finalize} disabled={busy || drafts.length === 0 || uniqueProblems.length > 0}>
          <Lock size={16} />
          {busy
            ? "Finalizing…"
            : drafts.length
              ? `Finalize ${drafts.length} item${drafts.length === 1 ? "" : "s"} · ${pieces} pcs`
              : "All items finalized"}
        </Button>
        {finalized.length > 0 && (
          <Link
            to={labelsLink}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-semibold text-fg hover:bg-surface-2"
          >
            <Printer size={16} /> Print labels ({finalized.reduce((n, i) => n + i.quantity, 0)})
          </Link>
        )}
      </div>
      {uniqueProblems.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-warning-text">
          {uniqueProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-error-text">{error}</p>}
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd
        className={`mt-1 font-medium ${
          tone === "bad" ? "text-error-text" : tone === "good" ? "text-tt-green-700" : "text-fg"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

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
      </div>

      <div className="mt-4 space-y-3">
        {items.map((it) => (
          <ItemRow key={it._localId} item={it} ctx={ctx} />
        ))}
        {items.length === 0 && (
          <p className="text-sm text-fg-muted">
            Not catalogued yet. Add one item per colour × size (and store).
          </p>
        )}
      </div>

      <div className="mt-4">
        <Button type="button" size="sm" variant="ghost" onClick={addItem}>
          <Plus size={16} />
          Add item{remaining > 0 ? ` (${remaining} left)` : ""}
        </Button>
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

/** One draft item: edits save on blur / change (offline-first write-through). */
function ItemRow({ item, ctx }: { item: InventoryItem; ctx: RowContext }) {
  const [name, setName] = useState(item.name);
  const [color, setColor] = useState(item.color);
  const [size, setSize] = useState(item.size);
  const [qty, setQty] = useState(String(item.quantity));
  const [mrp, setMrp] = useState(rupees(item.mrp_paise));
  const locked = item.status !== "draft";

  // Reflect external changes (e.g. "Round all MRPs", a sync pull).
  useEffect(() => setMrp(rupees(item.mrp_paise)), [item.mrp_paise]);
  useEffect(() => setQty(String(item.quantity)), [item.quantity]);

  const save = (changes: Parameters<typeof updateInventoryItem>[1]) =>
    void updateInventoryItem(item._localId, changes);

  const saveText = (field: "name" | "color" | "size", value: string) => {
    const v = value.trim();
    if (!v || v === item[field]) return;
    save({ [field]: v });
  };

  const categoryIdFor = (storeId: string | null, code: string) =>
    storeId ? (ctx.storeCategoryId.get(`${storeId}|${code}`) ?? null) : null;

  const storeMissingCategory =
    item.store_id != null && categoryIdFor(item.store_id, item.category_code) == null;
  const storeName = ctx.stores.find((s) => s.id === item.store_id)?.name;
  const categoryName = ctx.categoryNameByCode.get(item.category_code) ?? item.category_code;
  const mrpPaise = rupeesToPaise(mrp);

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
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      {item.sku && (
        <p className="mb-2 flex items-center gap-2 text-xs text-fg-muted">
          <Lock size={12} />
          <span className="font-mono text-sm text-fg">{item.sku}</span>
          {item.labels_printed > 0 && <span>· {item.labels_printed} labels printed</span>}
        </p>
      )}
      {/* Phones: 2 columns. Tablets: 4. Desktop: one row of 12 (qty/MRP wide enough to read). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-12">
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <Input
            label="Name"
            value={name}
            disabled={locked}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => saveText("name", name)}
          />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <SingleSelect
            label="Category"
            placeholder={null}
            disabled={locked}
            value={item.category_code}
            onChange={(e) =>
              save({
                category_code: e.target.value,
                category_id: categoryIdFor(item.store_id, e.target.value),
              })
            }
            options={
              ctx.categoryOptions.length
                ? ctx.categoryOptions.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))
                : [{ value: item.category_code, label: item.category_code }]
            }
          />
        </div>
        <Input
          label="Colour"
          value={color}
          disabled={locked}
          onChange={(e) => setColor(e.target.value)}
          onBlur={() => saveText("color", color)}
        />
        <Input
          label="Size"
          value={size}
          disabled={locked}
          onChange={(e) => setSize(e.target.value)}
          onBlur={() => saveText("size", size)}
        />
        <div className="lg:col-span-2">
          <Input
            label="Qty"
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
        </div>
        <div className="lg:col-span-2">
          <Input
            label="MRP (₹)"
            type="number"
            inputMode="decimal"
            value={mrp}
            onChange={(e) => setMrp(e.target.value)}
            onBlur={() => {
              if (mrpPaise != null && mrpPaise !== item.mrp_paise) save({ mrp_paise: mrpPaise });
              else setMrp(rupees(item.mrp_paise));
            }}
          />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-2">
          <SingleSelect
            label="Store"
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
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {mrpPaise != null && mrpPaise > MRP_5_PERCENT_MAX_PAISE && (
            <span className="rounded bg-warning-bg px-1.5 py-0.5 text-warning-text">18% GST</span>
          )}
          {item.landed_unit_cost_paise != null && mrpPaise != null && mrpPaise < item.landed_unit_cost_paise && (
            <span className="rounded bg-error-bg px-1.5 py-0.5 text-error-text">Below landed cost</span>
          )}
          {storeMissingCategory && (
            <span className="text-warning-text">
              {storeName} has no &ldquo;{categoryName}&rdquo; category.{" "}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => void addCategoryToStore()}
              >
                Add it
              </button>
            </span>
          )}
        </div>
        {!locked && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-fg-muted hover:text-red-500"
            onClick={() => void deleteInventoryItem(item._localId)}
            aria-label={`Remove ${item.name} ${item.color} ${item.size}`}
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
