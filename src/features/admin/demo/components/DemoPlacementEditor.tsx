import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { PlacementColor, PlacementType, RackDirection } from "@/db";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import {
  PLACEMENT_META,
  RACK_DIRECTIONS,
  rackCode,
} from "@/features/inventory/placement/placement";
import { LocationChip } from "@/features/inventory/placement/LocationChip";
import { ColorPicker } from "@/features/inventory/placement/ColorPicker";
import type { DemoPlacementNode } from "./demoPlacement";

/**
 * A simple, prefilled placement editor for the demo forms — shows the store's prefilled
 * placement tree, lets you remove any node or add a top-level one. Fine edits (renaming,
 * deep nesting) are done on the real store edit page after the demo is created. Operates on
 * plain form data (DemoPlacementNode[]); the real createStockLocation runs on submit.
 */
export function DemoPlacementEditor({
  value,
  onChange,
}: {
  value: DemoPlacementNode[];
  onChange: (nodes: DemoPlacementNode[]) => void;
}) {
  const removeAt = (path: number[]) => onChange(removeNode(value, path));

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-[13px] text-gray-400 dark:text-gray-500">
          No placements — this store will be created empty (placement is optional).
        </p>
      ) : (
        <div className="space-y-1">
          {value.map((n, i) => (
            <TreeRow key={i} node={n} path={[i]} depth={0} onRemove={removeAt} />
          ))}
        </div>
      )}
      <AddRow onAdd={(node) => onChange([...value, node])} siblings={value} />
    </div>
  );
}

function TreeRow({
  node,
  path,
  depth,
  onRemove,
}: {
  node: DemoPlacementNode;
  path: number[];
  depth: number;
  onRemove: (path: number[]) => void;
}) {
  const meta = PLACEMENT_META[node.type];
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 dark:border-gray-800 dark:bg-white/[0.03]"
        style={{ marginLeft: depth * 14 }}
      >
        <span className="text-xs" aria-hidden>
          {meta.icon}
        </span>
        <LocationChip code={node.code} color={node.color ?? null} />
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/10 dark:text-gray-400">
          {meta.label}
        </span>
        <button
          type="button"
          title="Remove"
          onClick={() => onRemove(path)}
          className="ml-auto rounded p-1 text-red-500 hover:bg-red-500/10"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {node.children?.map((c, i) => (
        <div key={i} className="mt-1">
          <TreeRow
            node={c}
            path={[...path, i]}
            depth={depth + 1}
            onRemove={onRemove}
          />
        </div>
      ))}
    </div>
  );
}

const ADD_TYPES: PlacementType[] = ["floor", "section", "zone", "rack"];

function AddRow({
  onAdd,
  siblings,
}: {
  onAdd: (node: DemoPlacementNode) => void;
  siblings: DemoPlacementNode[];
}) {
  const [type, setType] = useState<PlacementType>("zone");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<RackDirection>("E");
  const [row, setRow] = useState("1");
  const [col, setCol] = useState("1");
  const [color, setColor] = useState<PlacementColor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRack = type === "rack";
  const code = isRack ? rackCode(direction, row, col) : name.trim();

  const add = () => {
    setError(null);
    if (!code) {
      setError("Enter a name.");
      return;
    }
    if (siblings.some((s) => s.code.toLowerCase() === code.toLowerCase())) {
      setError(`“${code}” already exists here.`);
      return;
    }
    const colorProp = color ? { color } : {};
    onAdd(
      isRack
        ? {
            type: "rack",
            code,
            direction,
            row: Number(row) || 1,
            col: Number(col) || 1,
            ...colorProp,
          }
        : { type, code, ...colorProp },
    );
    setName("");
  };

  return (
    <div className="rounded-md border border-dashed border-gray-300 p-2 dark:border-gray-700">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-28">
          <SingleSelect
            label="Add"
            placeholder={null}
            value={type}
            onChange={(e) => setType(e.target.value as PlacementType)}
            options={ADD_TYPES.map((t) => ({
              value: t,
              label: `${PLACEMENT_META[t].icon} ${PLACEMENT_META[t].label}`,
            }))}
          />
        </div>
        {isRack ? (
          <>
            <div className="w-20">
              <SingleSelect
                label="Dir"
                placeholder={null}
                value={direction}
                onChange={(e) => setDirection(e.target.value as RackDirection)}
                options={RACK_DIRECTIONS.map((d) => ({ value: d, label: d }))}
              />
            </div>
            <div className="w-16">
              <Input
                label="Row"
                type="number"
                min={1}
                value={row}
                onChange={(e) => setRow(e.target.value)}
              />
            </div>
            <div className="w-16">
              <Input
                label="Col"
                type="number"
                min={1}
                value={col}
                onChange={(e) => setCol(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="min-w-[10rem] flex-1">
            <Input
              label="Name"
              placeholder={type === "zone" ? "e.g. The bandits" : "e.g. Lee"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          Add
        </Button>
      </div>
      <div className="mt-2">
        <ColorPicker value={color} onChange={setColor} label="Colour" />
      </div>
      {error && <p className="mt-1 text-[12px] text-red-500">{error}</p>}
    </div>
  );
}

/** Immutably remove the node at `path` (and its children). */
function removeNode(
  nodes: DemoPlacementNode[],
  path: number[],
): DemoPlacementNode[] {
  if (path.length === 1) return nodes.filter((_, i) => i !== path[0]);
  const [head, ...rest] = path;
  return nodes.map((n, i) =>
    i === head
      ? { ...n, children: removeNode(n.children ?? [], rest) }
      : n,
  );
}
