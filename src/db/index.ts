import Dexie, { type EntityTable } from "dexie";
import type { Product } from "./products";
import type { Invoice } from "./invoices";
import type { OutboxItem } from "./outbox";
import type { Member } from "./members";
import type { CachedEntitlements } from "./entitlements";
import type { PurchaseTrip } from "./purchaseTrips";
import type { PurchaseInvoice } from "./purchaseInvoices";
import type { PurchaseInvoiceItem } from "./purchaseInvoiceItems";
import type { TripExpense } from "./tripExpenses";
import type { TripActivity } from "./tripActivities";
import type { PendingReceipt } from "./pendingReceipts";

// Re-export entity types so external code keeps importing from `@/db`.
export type { SyncMeta } from "./types";
export type { Product } from "./products";
export type { Invoice } from "./invoices";
export type { OutboxItem } from "./outbox";
export type { Member } from "./members";
export type {
  CachedEntitlements,
  OrgEntitlement,
  StoreEntitlement,
} from "./entitlements";
export type { PurchaseTrip, TripRouteLeg, PurchaseTripStatus } from "./purchaseTrips";
export type { PurchaseInvoice } from "./purchaseInvoices";
export type { PurchaseInvoiceItem } from "./purchaseInvoiceItems";
export type { TripExpense, TripExpenseCategory } from "./tripExpenses";
export type { TripActivity, TripActivityKind } from "./tripActivities";
export type { PendingReceipt } from "./pendingReceipts";

export const db = new Dexie("tallythreads") as Dexie & {
  products: EntityTable<Product, "_localId">;
  invoices: EntityTable<Invoice, "_localId">;
  outbox: EntityTable<OutboxItem, "id">;
  members: EntityTable<Member, "id">;
  entitlements: EntityTable<CachedEntitlements, "memberId">;
  purchase_trips: EntityTable<PurchaseTrip, "_localId">;
  purchase_invoices: EntityTable<PurchaseInvoice, "_localId">;
  purchase_invoice_items: EntityTable<PurchaseInvoiceItem, "_localId">;
  trip_expenses: EntityTable<TripExpense, "_localId">;
  trip_activities: EntityTable<TripActivity, "_localId">;
  pending_receipts: EntityTable<PendingReceipt, "id">;
};

// ─── Migration history ───────────────────────────────────────────────
// Each version is frozen once shipped: never reorder or edit a past
// version's index strings, only append a new db.version(n).

db.version(1).stores({
  products: "_localId, id, store_id, name, _dirty, last_modified_at",
  invoices: "_localId, id, store_id, invoice_no, _dirty, last_modified_at",
  outbox: "++id, table, localId, queued_at",
});

db.version(2).stores({
  members: "_localId, id, google_id, _dirty, last_modified_at",
});

// v3 (M1a): members keyed on the real `id` so multiple members can be cached at once
// (shared-device support) — incompatible with v2's `_localId`-keyed single-row shape,
// so the old table is dropped and rebuilt rather than migrated. Pre-production data
// only; anyone upgrading just gets signed out and re-authenticates.
db.version(3)
  .stores({
    members: null,
  })
  .upgrade(() => {
    // no-op — the `null` above deletes the old store before v3's real definition
    // (next .stores() call) recreates it empty.
  });

db.version(4).stores({
  members: "id, google_id, is_active",
});

// v5: cache slot for one member's resolved entitlements (roles + permissions
// across all scopes), durable across reload/offline — see db/entitlements.ts.
db.version(5).stores({
  entitlements: "memberId",
});

// v6 (M4): purchase-trip tables — trip, its supplier invoices, their line items,
// and shared trip expenses. Sync-participating (_localId key, _dirty/last_modified_at
// indexes), same shape as products/invoices.
db.version(6).stores({
  purchase_trips:
    "_localId, id, organization_id, status, _dirty, last_modified_at",
  purchase_invoices: "_localId, id, trip_id, _dirty, last_modified_at",
  purchase_invoice_items: "_localId, id, invoice_id, _dirty, last_modified_at",
  trip_expenses: "_localId, id, trip_id, _dirty, last_modified_at",
});

// v7 (M4 active phase): the journey activity log.
db.version(7).stores({
  trip_activities: "_localId, id, trip_id, _dirty, last_modified_at",
});

// v8 (M4 active phase): receipts captured offline, awaiting extraction on reconnect.
// Local-only queue (like outbox), auto-increment key.
db.version(8).stores({
  pending_receipts: "++id, trip_id, created_at",
});
