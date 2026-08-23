import Dexie, { type EntityTable } from "dexie";

export interface SyncMeta {
  _localId: string;
  _dirty: 0 | 1;
  last_modified_at: string;
  deleted_at: string | null;
}

export interface Product extends SyncMeta {
  id?: string;
  store_id: string;
  name: string;
  hsn_code: string | null;
}

export interface Invoice extends SyncMeta {
  id?: string;
  store_id: string;
  /** {store_code}-{device_id}-{local_sequence} — never a central counter (§6) */
  invoice_no: string;
  total_paise: number;
}

export interface OutboxItem {
  id?: number;
  table: string;
  localId: string;
  op: "insert" | "update" | "delete";
  queued_at: string;
  attempts: number;
}

/**
 * Cache slot(s) for signed-in members' own profiles — not a general members table
 * sync (that's M2's job). Written directly from mint-member-session/verify-pin's
 * response, not through the outbox/_dirty push pipeline.
 *
 * Keyed on `id` (the real `members.id`, not a synthetic local id) so **more than one
 * member can be cached at once** — a shared store counter laptop/tablet used by
 * several staff each gets their own cached row, none of which evict each other.
 * Exactly one cached row has `is_active: 1` at a time — the member `/app/*` currently
 * renders as. The JWT lives directly on the row (not in a separate localStorage key)
 * so it's naturally per-member rather than a single global value. See
 * specs/tasks/M1a-identity-auth.md (Dexie multi-member note) and
 * specs/tasks/M1-auth-google.md.
 */
export interface Member {
  id: string;
  google_id: string;
  google_email: string;
  email_verified: boolean;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  jwt: string;
  is_active: 0 | 1;
  cached_at: string;
}

export const db = new Dexie("storeparda") as Dexie & {
  products: EntityTable<Product, "_localId">;
  invoices: EntityTable<Invoice, "_localId">;
  outbox: EntityTable<OutboxItem, "id">;
  members: EntityTable<Member, "id">;
};

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
