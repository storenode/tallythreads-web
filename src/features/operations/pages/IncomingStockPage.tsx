import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";

// Price-free feed for store staff (server view `incoming_stock`). Deliberately carries
// NO cost / MRP / margin / budget — see specs/roadmap/purchase-trips.md §10.
interface IncomingRow {
  trip_id: string;
  status: string;
  trip_title: string;
  expected_by: string | null;
  item_id: string;
  description: string;
  quantity: number;
}

interface TripGroup {
  trip_id: string;
  trip_title: string;
  expected_by: string | null;
  items: { item_id: string; description: string; quantity: number }[];
}

export default function IncomingStockPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["incoming_stock"],
    queryFn: async (): Promise<IncomingRow[]> => {
      const { data, error } = await supabase.from("incoming_stock").select("*");
      if (error) throw error;
      return (data ?? []) as IncomingRow[];
    },
  });

  const trips = useMemo<TripGroup[]>(() => {
    const byTrip = new Map<string, TripGroup>();
    for (const r of data ?? []) {
      let g = byTrip.get(r.trip_id);
      if (!g) {
        g = {
          trip_id: r.trip_id,
          trip_title: r.trip_title,
          expected_by: r.expected_by,
          items: [],
        };
        byTrip.set(r.trip_id, g);
      }
      g.items.push({ item_id: r.item_id, description: r.description, quantity: r.quantity });
    }
    return [...byTrip.values()];
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeading>Incoming Stock</PageHeading>
      <p className="text-sm text-fg-muted">
        New stock on its way — tell customers what to expect and when. Prices aren't shown
        here.
      </p>

      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">Couldn't load incoming stock.</p>
      ) : trips.length === 0 ? (
        <Card>
          <p className="text-sm text-fg-muted">No incoming stock right now.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {trips.map((t) => (
            <Card
              key={t.trip_id}
              title={t.trip_title}
              desc={t.expected_by ? `Expected by ${t.expected_by}` : "Arrival date TBD"}
            >
              <ul className="divide-y divide-border text-sm">
                {t.items.map((it) => (
                  <li key={it.item_id} className="flex justify-between py-1.5">
                    <span className="text-fg">{it.description}</span>
                    <span className="text-fg-muted">Qty {it.quantity}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
