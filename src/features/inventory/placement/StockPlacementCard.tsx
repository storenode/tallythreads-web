import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type {
  PlacementColor,
  PlacementType,
  RackDirection,
  StockLocation,
} from "@/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Modal } from "@/components/ui/Modal";
import {
  createStockLocation,
  deleteStockLocationCascade,
  updateStockLocation,
} from "./data";
import { swatchClasses } from "./colors";
import { ColorPicker } from "./ColorPicker";
import {
  buildTree,
  describeDescendants,
  descendantCounts,
  isContainer,
  PLACEMENT_META,
  rackCode,
  RACK_DIRECTIONS,
  type PlacementNode,
} from "./placement";

/**
 * Stock Placement card for the store edit page (between Store details and Members) — defines
 * a store's location tree: Floor › Section › Rack/Zone. Self-managing (each add/edit/delete
 * writes through Dexie immediately). Design is owner/manager-only; read-only otherwise.
 * See specs/roadmap/stock-placement.md.
 */
export function StockPlacementCard({
  storeId,
  canDesign,
}: {
  storeId: string;
  canDesign: boolean;
}) {
  const rows = useLiveQuery(
    async () =>
      (await db.stock_locations.where("store_id").equals(storeId).toArray()).filter(
        (r) => !r.deleted_at,
      ),
    [storeId],
  );

  const tree = useMemo(() => buildTree(rows ?? []), [rows]);

  // Only one inline form open at a time. `addUnder` is the parent server id (null = top level);
  // `undefined` = not adding. `editId` is a row _localId.
  const [addUnder, setAddUnder] = useState<string | null | undefined>(undefined);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PlacementNode | null>(null);

  const closeForms = () => {
    setAddUnder(undefined);
    setEditId(undefined);
  };

  // Siblings (active) under a given parent server id — for duplicate checks + sort_order.
  const siblingsOf = (parentId: string | null): StockLocation[] =>
    (rows ?? []).filter((r) => (r.parent_id ?? null) === parentId);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteStockLocationCascade(deleteTarget._localId);
    setDeleteTarget(null);
  };

  const desc =
    "Where stock sits in this store — floors, sections, racks, and zones. Optional.";

  return (
    <>
      <Card
        title="Stock Placement"
        desc={desc}
        actions={
          canDesign && addUnder === undefined && editId === undefined ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddUnder(null)}
            >
              + Add
            </Button>
          ) : undefined
        }
      >
        {rows === undefined ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : (
          <div className="space-y-2">
            {/* Top-level add form */}
            {canDesign && addUnder === null && (
              <LocationForm
                storeId={storeId}
                parentId={null}
                siblings={siblingsOf(null)}
                onDone={closeForms}
              />
            )}

            {tree.length === 0 && addUnder !== null ? (
              <p className="text-sm text-fg-muted">
                No placements yet. Add <strong>zones</strong> like “The bandits”, or{" "}
                <strong>racks</strong> for folded stock — or skip this, it’s optional.
              </p>
            ) : (
              tree.map((node) => (
                <PlacementTreeRow
                  key={node._localId}
                  node={node}
                  depth={0}
                  canDesign={canDesign}
                  addUnder={addUnder}
                  editId={editId}
                  storeId={storeId}
                  siblingsOf={siblingsOf}
                  onAddUnder={(pid) => {
                    setEditId(undefined);
                    setAddUnder(pid);
                  }}
                  onEdit={(lid) => {
                    setAddUnder(undefined);
                    setEditId(lid);
                  }}
                  onDelete={(n) => setDeleteTarget(n)}
                  onDone={closeForms}
                />
              ))
            )}
          </div>
        )}
      </Card>

      <DeleteDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}

// ─── Tree row (recursive) ────────────────────────────────────────────

function PlacementTreeRow({
  node,
  depth,
  canDesign,
  addUnder,
  editId,
  storeId,
  siblingsOf,
  onAddUnder,
  onEdit,
  onDelete,
  onDone,
}: {
  node: PlacementNode;
  depth: number;
  canDesign: boolean;
  addUnder: string | null | undefined;
  editId: string | undefined;
  storeId: string;
  siblingsOf: (parentId: string | null) => StockLocation[];
  onAddUnder: (parentServerId: string) => void;
  onEdit: (localId: string) => void;
  onDelete: (node: PlacementNode) => void;
  onDone: () => void;
}) {
  const meta = PLACEMENT_META[node.placement_type];
  const container = isContainer(node.placement_type);
  const editing = editId === node._localId;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2"
        style={{ marginLeft: depth * 16 }}
      >
        <span className="text-sm" aria-hidden>
          {meta.icon}
        </span>
        {!editing && (
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatchClasses(node.color)}`}
            title={node.color ?? "no colour"}
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          {editing ? (
            <LocationForm
              storeId={storeId}
              parentId={node.parent_id}
              siblings={siblingsOf(node.parent_id).filter(
                (r) => r._localId !== node._localId,
              )}
              editRow={node}
              onDone={onDone}
            />
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-fg">{node.code}</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
                {meta.label}
              </span>
              {node.label && (
                <span className="text-xs text-fg-muted">· {node.label}</span>
              )}
              {container && node.children.length > 0 && (
                <span className="text-[11px] text-fg-muted">
                  · {node.children.length} inside
                </span>
              )}
            </div>
          )}
        </div>

        {canDesign && !editing && (
          <div className="flex shrink-0 items-center gap-1">
            {container && (
              <button
                type="button"
                title="Add inside"
                onClick={() => node.id && onAddUnder(node.id)}
                className="rounded px-1.5 py-0.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                +
              </button>
            )}
            <button
              type="button"
              title="Edit"
              onClick={() => onEdit(node._localId)}
              className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              ✎
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => onDelete(node)}
              className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-500/10"
            >
              🗑
            </button>
          </div>
        )}
      </div>

      {/* Add-child form for this container */}
      {canDesign && addUnder === node.id && node.id && (
        <div style={{ marginLeft: (depth + 1) * 16 }} className="mt-2">
          <LocationForm
            storeId={storeId}
            parentId={node.id}
            parentType={node.placement_type}
            siblings={siblingsOf(node.id)}
            onDone={onDone}
          />
        </div>
      )}

      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <PlacementTreeRow
              key={child._localId}
              node={child}
              depth={depth + 1}
              canDesign={canDesign}
              addUnder={addUnder}
              editId={editId}
              storeId={storeId}
              siblingsOf={siblingsOf}
              onAddUnder={onAddUnder}
              onEdit={onEdit}
              onDelete={onDelete}
              onDone={onDone}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create / edit form ──────────────────────────────────────────────

/** Which node types may be created under a given parent. */
function allowedTypes(parentType: PlacementType | null): PlacementType[] {
  if (parentType === null) return ["floor", "section", "zone", "rack"];
  if (parentType === "floor") return ["section", "zone", "rack"];
  if (parentType === "section") return ["zone", "rack"];
  return []; // leaves never have children
}

function LocationForm({
  storeId,
  parentId,
  parentType = null,
  siblings,
  editRow,
  onDone,
}: {
  storeId: string;
  parentId: string | null;
  parentType?: PlacementType | null;
  siblings: StockLocation[];
  editRow?: StockLocation;
  onDone: () => void;
}) {
  const isEdit = !!editRow;
  const types = allowedTypes(parentType);
  const [type, setType] = useState<PlacementType>(
    editRow?.placement_type ?? types[0] ?? "zone",
  );

  // name/code fields
  const [name, setName] = useState(editRow ? editRow.code : "");
  const [label, setLabel] = useState(editRow?.label ?? "");

  // rack builder
  const [direction, setDirection] = useState<RackDirection>(
    editRow?.direction ?? "E",
  );
  const [row, setRow] = useState(editRow?.rack_row ?? "1");
  const [col, setCol] = useState(editRow?.rack_col ?? "1");
  const [codeTouched, setCodeTouched] = useState(isEdit);
  const [rackCodeValue, setRackCodeValue] = useState(
    editRow?.code ?? rackCode("E", "1", "1"),
  );

  // bulk grid (create-only, rack-only)
  const [bulk, setBulk] = useState(false);
  const [rowTo, setRowTo] = useState("1");
  const [colTo, setColTo] = useState("1");

  const [color, setColor] = useState<PlacementColor | null>(
    editRow?.color ?? null,
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isRack = type === "rack";
  const genCode = rackCode(direction, row, col);
  const effectiveRackCode = codeTouched ? rackCodeValue : genCode;

  const dupOf = (code: string) =>
    siblings.some((s) => s.code.toLowerCase() === code.trim().toLowerCase());

  const save = async () => {
    setError(null);
    const base = siblings.length;

    if (isRack && bulk && !isEdit) {
      const r0 = Math.max(1, Math.trunc(Number(row) || 1));
      const r1 = Math.max(r0, Math.trunc(Number(rowTo) || r0));
      const c0 = Math.max(1, Math.trunc(Number(col) || 1));
      const c1 = Math.max(c0, Math.trunc(Number(colTo) || c0));
      const codes: string[] = [];
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) codes.push(rackCode(direction, r, c));
      const clash = codes.find((c) => dupOf(c));
      if (clash) {
        setError(`“${clash}” already exists here.`);
        return;
      }
      setSaving(true);
      let i = 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          await createStockLocation({
            store_id: storeId,
            parent_id: parentId,
            placement_type: "rack",
            code: rackCode(direction, r, c),
            label: null,
            direction,
            rack_row: String(r).padStart(2, "0"),
            rack_col: String(c).padStart(2, "0"),
            layout: null,
            color,
            sort_order: base + i++,
          });
        }
      }
      setSaving(false);
      onDone();
      return;
    }

    const code = (isRack ? effectiveRackCode : name).trim();
    if (!code) {
      setError("A name is required.");
      return;
    }
    if (dupOf(code)) {
      setError(`“${code}” already exists here.`);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateStockLocation(editRow!._localId, {
          code,
          label: label.trim() || null,
          color,
          ...(editRow!.placement_type === "rack"
            ? { direction, rack_row: row, rack_col: col }
            : {}),
        });
      } else {
        await createStockLocation({
          store_id: storeId,
          parent_id: parentId,
          placement_type: type,
          code,
          label: label.trim() || null,
          direction: isRack ? direction : null,
          rack_row: isRack ? String(row).padStart(2, "0") : null,
          rack_col: isRack ? String(col).padStart(2, "0") : null,
          layout: null,
          color,
          sort_order: base,
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-brand/40 bg-surface-2/40 p-3">
      <div className="flex flex-col gap-3">
        {!isEdit && types.length > 1 && (
          <SingleSelect
            label="Type"
            placeholder={null}
            value={type}
            onChange={(e) => setType(e.target.value as PlacementType)}
            options={types.map((t) => ({
              value: t,
              label: `${PLACEMENT_META[t].icon} ${PLACEMENT_META[t].label}`,
            }))}
          />
        )}

        {isRack ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <SingleSelect
                label="Direction"
                placeholder={null}
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value as RackDirection);
                  setCodeTouched(false);
                }}
                options={RACK_DIRECTIONS.map((d) => ({ value: d, label: d }))}
              />
              <Input
                label="Row"
                type="number"
                inputMode="numeric"
                min={1}
                value={row}
                onChange={(e) => {
                  setRow(e.target.value);
                  setCodeTouched(false);
                }}
              />
              <Input
                label={bulk ? "Row to" : "Column"}
                type="number"
                inputMode="numeric"
                min={1}
                value={bulk ? rowTo : col}
                onChange={(e) => {
                  if (bulk) setRowTo(e.target.value);
                  else {
                    setCol(e.target.value);
                    setCodeTouched(false);
                  }
                }}
              />
            </div>

            {bulk ? (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Column"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={col}
                  onChange={(e) => setCol(e.target.value)}
                />
                <Input
                  label="Column to"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={colTo}
                  onChange={(e) => setColTo(e.target.value)}
                />
              </div>
            ) : (
              <Input
                label="Code (editable)"
                value={effectiveRackCode}
                onChange={(e) => {
                  setRackCodeValue(e.target.value);
                  setCodeTouched(true);
                }}
              />
            )}

            {!isEdit && (
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={bulk}
                  onChange={(e) => setBulk(e.target.checked)}
                />
                Add a grid (bulk)
              </label>
            )}
          </div>
        ) : (
          <Input
            label={`${PLACEMENT_META[type].label} name`}
            placeholder={type === "zone" ? "e.g. The bandits" : "e.g. Lee"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        {!isRack && (
          <Input
            label="Description (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}

        <ColorPicker value={color} onChange={setColor} />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirmation ─────────────────────────────────────────────

function DeleteDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: PlacementNode | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!target) return null;

  const counts = descendantCounts(target);
  const inside = describeDescendants(counts);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onCancel} title={`Delete “${target.code}”?`}>
      <p className="text-sm text-fg-muted">
        {inside ? (
          <>
            This also removes everything inside it —{" "}
            <span className="font-medium text-fg">{inside}</span>. This can’t be undone.
          </>
        ) : (
          <>This removes the placement. This can’t be undone.</>
        )}
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className="bg-red-500 hover:enabled:bg-red-600"
          onClick={run}
          disabled={busy}
        >
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}
