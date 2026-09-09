import { supabase } from "@/lib/supabaseClient";

// Server-side Purchase-Trip demo seeder. Unlike the app's offline-first write path
// (Dexie + outbox), the demo provisions data directly on Supabase as the platform_admin
// (RLS insert policies pass via is_platform_admin()). It seeds a spread of trips covering
// every lifecycle status and the main combinations — planning, active (mixed parcel
// arrival), completed (all arrived), cancelled, and an empty just-started trip — so the
// demo shows the whole Purchase-Trip surface at each organization type.
//
// All money is integer paise. Rows are wiped by seed/_manual_reset.sql.

const rupees = (n: number) => Math.round(n * 100);

type Mode = "driving" | "transit" | "bicycling" | "walking";

interface SeedLeg {
  from: string;
  to: string;
  boarding: string;
  drop_point: string;
  distance_km: number;
  mode: Mode;
  price_paise: number;
  planned_purchase_paise: number;
}

interface SeedItem {
  description: string;
  hsn_code: string | null;
  quantity: number;
  unit_cost_paise: number;
  is_trending: boolean;
}

interface SeedInvoice {
  supplier_name: string;
  supplier_gstin: string | null;
  supplier_invoice_no: string | null;
  invoice_date: string | null;
  margin_config: Record<string, unknown> | null;
  source: "manual" | "ai_scan";
  ai_confidence: "high" | "medium" | "low" | null;
  needs_review: boolean;
  /** null = parcel in transit; an ISO timestamp = arrived at store. */
  arrived_at: string | null;
  items: SeedItem[];
}

interface SeedExpense {
  category: "travel" | "lodging" | "food" | "transport" | "other";
  amount_paise: number;
  note: string | null;
}

interface SeedActivity {
  kind:
    | "note"
    | "started"
    | "completed"
    | "arrived"
    | "expense"
    | "invoice"
    | "receipt_scan"
    | "cancelled";
  note: string | null;
  /** index into `invoices` this activity refers to, or null */
  refInvoiceIdx: number | null;
  occurred_at: string;
}

interface SeedTrip {
  title: string;
  status: "planning" | "active" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  route: SeedLeg[] | null;
  planned_budget_paise: number | null;
  estimated_expenses_paise: number | null;
  expense_estimate_source: "manual" | "ai" | null;
  expected_margin_pct: number | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  invoices: SeedInvoice[];
  expenses: SeedExpense[];
  activities: SeedActivity[];
}

/** Insert one trip and all its children, wiring FKs by generated id. */
async function insertTrip(
  orgId: string,
  createdBy: string,
  t: SeedTrip,
): Promise<void> {
  const tripId = crypto.randomUUID();
  const { error: tripErr } = await supabase.from("purchase_trips").insert({
    id: tripId,
    organization_id: orgId,
    created_by: createdBy,
    title: t.title,
    status: t.status,
    start_date: t.start_date,
    end_date: t.end_date,
    route: t.route,
    planned_budget_paise: t.planned_budget_paise,
    estimated_expenses_paise: t.estimated_expenses_paise,
    expense_estimate_source: t.expense_estimate_source,
    expected_margin_pct: t.expected_margin_pct,
    notes: t.notes,
    started_at: t.started_at,
    completed_at: t.completed_at,
  });
  if (tripErr) throw tripErr;

  // Invoices + their items. Keep the generated ids so activities can reference them.
  const invoiceIds: string[] = [];
  for (const inv of t.invoices) {
    const invoiceId = crypto.randomUUID();
    invoiceIds.push(invoiceId);
    const { error: invErr } = await supabase.from("purchase_invoices").insert({
      id: invoiceId,
      trip_id: tripId,
      supplier_name: inv.supplier_name,
      supplier_gstin: inv.supplier_gstin,
      supplier_invoice_no: inv.supplier_invoice_no,
      invoice_date: inv.invoice_date,
      margin_config: inv.margin_config,
      margin_plugin_id: null,
      notes: null,
      source: inv.source,
      receipt_path: null,
      ai_confidence: inv.ai_confidence,
      needs_review: inv.needs_review,
      arrived_at: inv.arrived_at,
    });
    if (invErr) throw invErr;

    if (inv.items.length) {
      const { error: itemErr } = await supabase
        .from("purchase_invoice_items")
        .insert(
          inv.items.map((it) => ({
            id: crypto.randomUUID(),
            invoice_id: invoiceId,
            description: it.description,
            hsn_code: it.hsn_code,
            quantity: it.quantity,
            unit_cost_paise: it.unit_cost_paise,
            is_trending: it.is_trending,
          })),
        );
      if (itemErr) throw itemErr;
    }
  }

  if (t.expenses.length) {
    const { error: expErr } = await supabase.from("trip_expenses").insert(
      t.expenses.map((e) => ({
        id: crypto.randomUUID(),
        trip_id: tripId,
        category: e.category,
        amount_paise: e.amount_paise,
        note: e.note,
      })),
    );
    if (expErr) throw expErr;
  }

  if (t.activities.length) {
    const { error: actErr } = await supabase.from("trip_activities").insert(
      t.activities.map((a) => ({
        id: crypto.randomUUID(),
        trip_id: tripId,
        member_id: createdBy,
        kind: a.kind,
        note: a.note,
        ref_invoice_id:
          a.refInvoiceIdx != null ? (invoiceIds[a.refInvoiceIdx] ?? null) : null,
        occurred_at: a.occurred_at,
      })),
    );
    if (actErr) throw actErr;
  }
}

/**
 * Build the demo trip set. `label` prefixes trip titles so trips read as belonging to the
 * org (e.g. "Bandrip · Surat sourcing"). Dates are static so demos are reproducible.
 */
function demoTrips(label: string): SeedTrip[] {
  const leg = (over: Partial<SeedLeg>): SeedLeg => ({
    from: "Home city",
    to: "Surat",
    boarding: "Central bus stand",
    drop_point: "Ring Road textile market",
    distance_km: 1650,
    mode: "transit",
    price_paise: rupees(1800),
    planned_purchase_paise: rupees(200000),
    ...over,
  });
  const flat = (pct: number) => ({ type: "flat", pct });

  return [
    // 1) PLANNING — route + budget + estimate, nothing bought yet.
    {
      title: `${label} · Surat sourcing (planning)`,
      status: "planning",
      start_date: "2026-10-01",
      end_date: "2026-10-05",
      route: [
        leg({ to: "Surat", distance_km: 1650 }),
        leg({
          from: "Surat",
          to: "Home city",
          distance_km: 1650,
          planned_purchase_paise: 0,
        }),
      ],
      planned_budget_paise: rupees(250000),
      estimated_expenses_paise: rupees(22000),
      expense_estimate_source: "manual",
      expected_margin_pct: 35,
      notes: "Diwali stock buy — sarees + kurtis. Budget is a first pass.",
      started_at: null,
      completed_at: null,
      invoices: [],
      expenses: [],
      activities: [
        {
          kind: "note",
          note: "Planned the route and budget.",
          refInvoiceIdx: null,
          occurred_at: "2026-09-20T09:00:00Z",
        },
      ],
    },
    // 2) ACTIVE — mixed parcel arrival: one invoice arrived, one still in transit;
    //    one manual invoice, one AI-scanned flagged for review.
    {
      title: `${label} · Erode & Tirupur (active)`,
      status: "active",
      start_date: "2026-09-02",
      end_date: "2026-09-06",
      route: [
        leg({ to: "Erode", distance_km: 520, price_paise: rupees(900) }),
        leg({
          from: "Erode",
          to: "Tirupur",
          distance_km: 55,
          price_paise: rupees(300),
          planned_purchase_paise: rupees(80000),
        }),
      ],
      planned_budget_paise: rupees(180000),
      estimated_expenses_paise: rupees(15000),
      expense_estimate_source: "manual",
      expected_margin_pct: 30,
      notes: "Cotton basics + kids wear.",
      started_at: "2026-09-02T04:30:00Z",
      completed_at: null,
      invoices: [
        {
          supplier_name: "Sri Lakshmi Textiles",
          supplier_gstin: "33AABCS1234R1Z2",
          supplier_invoice_no: "SLT/2026/119",
          invoice_date: "2026-09-03",
          margin_config: flat(0.3),
          source: "manual",
          ai_confidence: null,
          needs_review: false,
          arrived_at: "2026-09-05T11:00:00Z", // arrived
          items: [
            {
              description: "Cotton saree (assorted)",
              hsn_code: "5407",
              quantity: 40,
              unit_cost_paise: rupees(450),
              is_trending: true,
            },
            {
              description: "Kids frock",
              hsn_code: "6111",
              quantity: 60,
              unit_cost_paise: rupees(180),
              is_trending: false,
            },
          ],
        },
        {
          supplier_name: "ELVYBE Apparels",
          supplier_gstin: null,
          supplier_invoice_no: "EA-5521",
          invoice_date: "2026-09-04",
          margin_config: flat(0.2),
          source: "ai_scan",
          ai_confidence: "medium",
          needs_review: true,
          arrived_at: null, // still in transit
          items: [
            {
              description: "Oversized T-shirt 250gsm",
              hsn_code: "6109",
              quantity: 20,
              unit_cost_paise: rupees(450),
              is_trending: true,
            },
          ],
        },
      ],
      expenses: [
        { category: "travel", amount_paise: rupees(1200), note: "Bus" },
        { category: "lodging", amount_paise: rupees(3000), note: "2 nights" },
        { category: "food", amount_paise: rupees(1000), note: null },
      ],
      activities: [
        {
          kind: "started",
          note: null,
          refInvoiceIdx: null,
          occurred_at: "2026-09-02T04:30:00Z",
        },
        {
          kind: "receipt_scan",
          note: "Scanned receipt: ELVYBE Apparels",
          refInvoiceIdx: 1,
          occurred_at: "2026-09-04T15:20:00Z",
        },
        {
          kind: "arrived",
          note: "Parcel arrived: Sri Lakshmi Textiles",
          refInvoiceIdx: 0,
          occurred_at: "2026-09-05T11:00:00Z",
        },
        {
          kind: "expense",
          note: "Lodging",
          refInvoiceIdx: null,
          occurred_at: "2026-09-05T20:00:00Z",
        },
      ],
    },
    // 3) COMPLETED — both parcels arrived, expenses recorded, finalized.
    {
      title: `${label} · Kolkata wholesale (completed)`,
      status: "completed",
      start_date: "2026-08-10",
      end_date: "2026-08-14",
      route: [leg({ to: "Kolkata", distance_km: 1900, price_paise: rupees(2200) })],
      planned_budget_paise: rupees(300000),
      estimated_expenses_paise: rupees(25000),
      expense_estimate_source: "manual",
      expected_margin_pct: 32,
      notes: "Festive collection — completed.",
      started_at: "2026-08-10T05:00:00Z",
      completed_at: "2026-08-14T18:00:00Z",
      invoices: [
        {
          supplier_name: "Burrabazar Fabrics",
          supplier_gstin: "19AAECB9876Q1Z0",
          supplier_invoice_no: "BF/778",
          invoice_date: "2026-08-11",
          margin_config: { type: "trending", basePct: 0.28, trendingPct: 0.45 },
          source: "manual",
          ai_confidence: null,
          needs_review: false,
          arrived_at: "2026-08-16T10:00:00Z",
          items: [
            {
              description: "Banarasi silk saree",
              hsn_code: "5007",
              quantity: 15,
              unit_cost_paise: rupees(1800),
              is_trending: true,
            },
            {
              description: "Cotton kurti",
              hsn_code: "6106",
              quantity: 80,
              unit_cost_paise: rupees(260),
              is_trending: false,
            },
          ],
        },
        {
          supplier_name: "Metro Hosiery",
          supplier_gstin: null,
          supplier_invoice_no: "MH-3390",
          invoice_date: "2026-08-12",
          margin_config: { type: "flat", pct: 0.25 },
          source: "ai_scan",
          ai_confidence: "high",
          needs_review: false,
          arrived_at: "2026-08-17T09:00:00Z",
          items: [
            {
              description: "Leggings (pack)",
              hsn_code: "6115",
              quantity: 100,
              unit_cost_paise: rupees(120),
              is_trending: false,
            },
          ],
        },
      ],
      expenses: [
        { category: "travel", amount_paise: rupees(4400), note: "Train return" },
        { category: "lodging", amount_paise: rupees(6000), note: "4 nights" },
        { category: "transport", amount_paise: rupees(2000), note: "Local cartage" },
      ],
      activities: [
        {
          kind: "started",
          note: null,
          refInvoiceIdx: null,
          occurred_at: "2026-08-10T05:00:00Z",
        },
        {
          kind: "invoice",
          note: "Added invoice: Burrabazar Fabrics",
          refInvoiceIdx: 0,
          occurred_at: "2026-08-11T14:00:00Z",
        },
        {
          kind: "arrived",
          note: "Parcel arrived: Burrabazar Fabrics",
          refInvoiceIdx: 0,
          occurred_at: "2026-08-16T10:00:00Z",
        },
        {
          kind: "arrived",
          note: "Parcel arrived: Metro Hosiery",
          refInvoiceIdx: 1,
          occurred_at: "2026-08-17T09:00:00Z",
        },
        {
          kind: "completed",
          note: null,
          refInvoiceIdx: null,
          occurred_at: "2026-08-14T18:00:00Z",
        },
      ],
    },
    // 4) CANCELLED — planned but called off before starting.
    {
      title: `${label} · Delhi trip (cancelled)`,
      status: "cancelled",
      start_date: "2026-09-15",
      end_date: "2026-09-18",
      route: [leg({ to: "Delhi", distance_km: 2100, price_paise: rupees(2500) })],
      planned_budget_paise: rupees(220000),
      estimated_expenses_paise: rupees(20000),
      expense_estimate_source: "manual",
      expected_margin_pct: 33,
      notes: "Called off — supplier postponed the fair.",
      started_at: null,
      completed_at: null,
      invoices: [],
      expenses: [],
      activities: [
        {
          kind: "note",
          note: "Planned around the Delhi trade fair.",
          refInvoiceIdx: null,
          occurred_at: "2026-09-08T10:00:00Z",
        },
        {
          kind: "cancelled",
          note: null,
          refInvoiceIdx: null,
          occurred_at: "2026-09-10T12:00:00Z",
        },
      ],
    },
    // 5) ACTIVE (just started, nothing recorded yet) — the empty-active edge case.
    {
      title: `${label} · Just started (empty)`,
      status: "active",
      start_date: "2026-09-08",
      end_date: "2026-09-11",
      route: [leg({ to: "Ahmedabad", distance_km: 1700, price_paise: rupees(1900) })],
      planned_budget_paise: rupees(150000),
      estimated_expenses_paise: rupees(12000),
      expense_estimate_source: "manual",
      expected_margin_pct: 30,
      notes: "On the road — invoices to be added.",
      started_at: "2026-09-08T06:00:00Z",
      completed_at: null,
      invoices: [],
      expenses: [],
      activities: [
        {
          kind: "started",
          note: null,
          refInvoiceIdx: null,
          occurred_at: "2026-09-08T06:00:00Z",
        },
      ],
    },
  ];
}

/**
 * Seed the full demo Purchase-Trip set for one organization. `createdBy` is the org
 * owner's member id (from the invite result). Runs after org + owner exist.
 */
export async function seedDemoPurchaseTrips(
  orgId: string,
  createdBy: string,
  label: string,
): Promise<void> {
  for (const t of demoTrips(label)) {
    await insertTrip(orgId, createdBy, t);
  }
}
