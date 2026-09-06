import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { formatInr } from "@/lib/money";

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
};

export default function PurchaseTripsListPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();

  const trips = useLiveQuery(async () => {
    if (!orgId) return [];
    const rows = await db.purchase_trips
      .where("organization_id")
      .equals(orgId)
      .toArray();
    return rows
      .filter((t) => !t.deleted_at)
      .sort((a, b) => b.last_modified_at.localeCompare(a.last_modified_at));
  }, [orgId]);

  if (!orgId) return null;

  return (
    <div className="space-y-6">
      <PageHeading
        action={<Button onClick={() => navigate("new")}>New trip</Button>}
      >
        Purchase Trips
      </PageHeading>

      {trips === undefined ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : trips.length === 0 ? (
        <Card>
          <p className="text-sm text-fg-muted">
            No purchase trips yet. Plan a buying trip to track landed cost and
            suggested MRP.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {trips.map((t) => (
            <Link
              key={t._localId}
              to={t._localId}
              className="block rounded-lg border border-border bg-bg-elevated p-4 hover:border-fg-muted"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-fg">{t.title}</div>
                  <div className="mt-0.5 text-xs text-fg-muted">
                    {STATUS_LABEL[t.status] ?? t.status}
                    {t.start_date ? ` · ${t.start_date}` : ""}
                    {t.end_date ? ` → ${t.end_date}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  {t.planned_budget_paise != null && (
                    <div className="text-sm text-fg">
                      {formatInr(t.planned_budget_paise)}
                    </div>
                  )}
                  <div
                    className={`mt-0.5 text-xs ${
                      t._dirty === 1 ? "text-amber-500" : "text-fg-muted"
                    }`}
                  >
                    {t._dirty === 1 ? "Pending sync ↑" : "Synced ✓"}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
