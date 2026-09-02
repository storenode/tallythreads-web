import { Link } from "react-router-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

/**
 * One row of the launch-page grid (LaunchPage.tsx) — a flat list, in order: Admin
 * (if platform_admin), then every distinct organization the member holds a role
 * on, then every distinct store. No grouping and no expand/collapse (feedback,
 * 2026-09-03, both rounds — see the "Flattened" notes in LaunchPage.tsx's file
 * comment): first the per-role child rows went, then the Admin/Organization/
 * Operations parent rows went too, since neither was an actual destination. Every
 * row here is a leaf with its own `to`. Kept this filename rather than renaming to
 * something like LaunchAreaTable to avoid leaving an orphaned file behind — this
 * component just isn't a tree anymore.
 *
 * `parentLabel` (2026-09-03): a store belongs to exactly one organization, and
 * flattening the list (above) left that relationship with nowhere to show — a
 * store's org name was buried at the end of its Details cell. LaunchPage.tsx now
 * places a store's row directly after its own organization's row and sets
 * `parentLabel` to that organization's name; this renders it as a small "in
 * <parentLabel>" line under the store name plus a slight indent, so the
 * relationship reads at a glance without reintroducing an expand/collapse control.
 */
export interface LaunchRow {
  id: string;
  name: string;
  to: string;
  scope: "Admin" | "Organization" | "Store";
  role: string;
  permissionCount?: number;
  detail?: string;
  /** Parent organization's display name, for a Store row only — see the file
   * comment above. Renders a small "in <parentLabel>" line under the name plus a
   * slight indent. Absent for Admin/Organization rows. */
  parentLabel?: string;
}

const columnHelper = createColumnHelper<LaunchRow>();

const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: ({ row }) => (
      <div style={row.original.parentLabel ? { paddingLeft: "1.25rem" } : undefined}>
        <Link
          to={row.original.to}
          className="text-sm font-medium text-fg hover:text-tt-green-600 hover:underline"
        >
          {row.original.name}
        </Link>
        {row.original.parentLabel && (
          <p className="text-xs text-fg-muted">in {row.original.parentLabel}</p>
        )}
      </div>
    ),
  }),
  columnHelper.accessor("scope", {
    header: "Type",
    cell: ({ getValue }) => (
      <span className="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("role", {
    header: "Role",
    cell: ({ getValue }) => (
      <span className="text-sm text-fg-muted">{getValue()}</span>
    ),
  }),
  columnHelper.accessor("permissionCount", {
    header: "Permissions",
    cell: ({ getValue }) => {
      const count = getValue();
      return (
        <span className="text-sm text-fg-muted">
          {count === undefined ? "—" : `${count} permission${count === 1 ? "" : "s"}`}
        </span>
      );
    },
  }),
  columnHelper.accessor("detail", {
    header: "Details",
    cell: ({ getValue }) => (
      <span className="text-sm text-fg-muted">{getValue() ?? "—"}</span>
    ),
  }),
];

interface LaunchAreaTreeProps {
  data: LaunchRow[];
}

/** Plain TanStack Table render of `data` — no row nesting, no expand state. */
export function LaunchAreaTree({ data }: LaunchAreaTreeProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            {table.getHeaderGroups()[0].headers.map((header) => (
              <th
                key={header.id}
                className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-fg-muted"
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border last:border-0 hover:bg-surface-2/60"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 align-middle">
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
