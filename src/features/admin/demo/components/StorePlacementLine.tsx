import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { LocationChip } from "@/features/inventory/placement/LocationChip";
import {
  buildTree,
  isContainer,
  PLACEMENT_META,
  type PlacementNode,
} from "@/features/inventory/placement/placement";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const LABEL = "text-[11px] text-gray-500 dark:text-gray-400";

/**
 * Stock placement for a store, shown inside the demo store cards — the **nested tree**
 * (Floor › Section › its zones/racks) as colour chips, each line prefixed with a type label
 * ("section: …", "zones: …", "racks: …") so you see both the structure and what's inside each
 * container. Reads from Dexie so demo placements created via the real write-through appear
 * immediately (same source as the store edit page).
 */
export function StorePlacementLine({ storeId }: { storeId: string }) {
  const rows = useLiveQuery(
    async () =>
      (await db.stock_locations.where("store_id").equals(storeId).toArray()).filter(
        (r) => !r.deleted_at,
      ),
    [storeId],
  );

  const tree = buildTree(rows ?? []);

  return (
    <div className="mt-3">
      <p
        className="mb-1.5 text-[11px] tracking-wide text-gray-400 uppercase dark:text-gray-500"
        style={{ fontFamily: MONO }}
      >
        Placement
      </p>

      {rows === undefined ? (
        <p className="text-[13px] text-gray-400 dark:text-gray-500">…</p>
      ) : tree.length === 0 ? (
        <p className={LABEL} style={{ fontFamily: MONO }}>
          none
        </p>
      ) : (
        <div className="space-y-1.5">
          <Nodes nodes={tree} depth={0} />
        </div>
      )}
    </div>
  );
}

/** One level of the tree: the leaf chips grouped + labelled by type (zones / racks), then each
 * container (floor / section), labelled by type, with its children nested beneath. */
function Nodes({ nodes, depth }: { nodes: PlacementNode[]; depth: number }) {
  const zones = nodes.filter((n) => n.placement_type === "zone");
  const racks = nodes.filter((n) => n.placement_type === "rack");
  const containers = nodes.filter((n) => isContainer(n.placement_type));

  return (
    <>
      <LeafGroup label="zones" items={zones} depth={depth} />
      <LeafGroup label="racks" items={racks} depth={depth} />
      {containers.map((c) => (
        <div key={c._localId} className="space-y-1">
          <div
            className="flex flex-wrap items-center gap-1"
            style={{ marginLeft: depth * 12 }}
          >
            <span className={LABEL} style={{ fontFamily: MONO }}>
              {PLACEMENT_META[c.placement_type].label.toLowerCase()}:
            </span>
            <LocationChip code={c.code} color={c.color} />
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              ({c.children.length})
            </span>
          </div>
          {c.children.length > 0 && <Nodes nodes={c.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

function LeafGroup({
  label,
  items,
  depth,
}: {
  label: string;
  items: PlacementNode[];
  depth: number;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      style={{ marginLeft: depth * 12 }}
    >
      <span className={LABEL} style={{ fontFamily: MONO }}>
        {label}:
      </span>
      {items.map((n) => (
        <LocationChip key={n._localId} code={n.code} color={n.color} />
      ))}
    </div>
  );
}
