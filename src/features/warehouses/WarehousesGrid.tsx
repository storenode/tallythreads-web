import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useWarehousesByOrg } from "./data";
import { WarehouseTypeBadge } from "./ui";

/** The org's stock rooms, shown as a grid on the Stores page below the stores grid.
 * Read from Dexie (offline-first) so a just-created stock room appears immediately. */
export function WarehousesGrid({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const warehouses = useWarehousesByOrg(orgId);

  if (warehouses === undefined) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-fg-muted">Stock rooms</h2>
      {warehouses.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No stock rooms yet — add a backyard, stockroom, or godown to hold stock off the
          selling floor.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <div
              key={w._localId}
              className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-medium text-fg">{w.name}</h3>
                  <WarehouseTypeBadge type={w.warehouse_type} />
                </div>
                {w.note && (
                  <p className="mt-1 text-sm text-fg-muted">{w.note}</p>
                )}
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    w.id &&
                    navigate(`/org/${orgId}/stock-rooms/${w.id}/edit`)
                  }
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
