import Dexie, { type EntityTable } from "dexie";
import type { Product } from "./products";
import type { Invoice } from "./invoices";
import type { OutboxItem } from "./outbox";
import type { Member } from "./members";

// Re-export entity types so external code keeps importing from `@/db`.
export type { SyncMeta } from "./types";
export type { Product } from "./products";
export type { Invoice } from "./invoices";
export type { OutboxItem } from "./outbox";
export type { Member } from "./members";

export const db = new Dexie("tallythreads") as Dexie & {
  products: EntityTable<Product, "_localId">;
  invoices: EntityTable<Invoice, "_localId">;
  outbox: EntityTable<OutboxItem, "id">;
  members: EntityTable<Member, "id">;
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
