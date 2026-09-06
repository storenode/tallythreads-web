/**
 * Offline-first write-through helpers for the purchase-trip tables (constitution
 * §2.I). Every write lands in Dexie first, flips `_dirty=1`, bumps
 * `last_modified_at`, and enqueues an outbox row for the sync pusher (M2). Deletes
 * are soft only — `deleted_at` is stamped, the row stays (§6).
 */
import type { EntityTable } from "dexie";
import { db } from "@/db";
import type { SyncMeta } from "@/db";

const now = () => new Date().toISOString();

type WriteThroughTable<T extends SyncMeta> = EntityTable<T, "_localId">;
type Op = "insert" | "update" | "delete";

// Dexie's generic `update` key type (`T | IDType<T, "_localId">`) doesn't resolve
// to `string` through this module's own type param, so narrow the call here.
const updateByLocalId = <T extends SyncMeta>(
  table: WriteThroughTable<T>,
  localId: string,
  patch: Partial<T>,
) => (table.update as (k: string, c: Partial<T>) => Promise<number>)(localId, patch);

async function enqueue(table: string, localId: string, op: Op): Promise<void> {
  await db.outbox.add({ table, localId, op, queued_at: now(), attempts: 0 });
}

/**
 * Insert a new row with a fresh `_localId` AND a client-generated server `id`.
 *
 * The `id` is generated here (a uuid the Postgres PK accepts) rather than waiting for
 * the server to assign one on push. That's what makes offline parent→child creation
 * work: an invoice created offline can reference its trip's real `id` immediately,
 * with no local→server id remapping in the sync engine. Push upserts by this id; a
 * caller may still pass an explicit `id` to override.
 */
export async function createRow<T extends SyncMeta>(
  tableName: string,
  table: WriteThroughTable<T>,
  data: Omit<T, keyof SyncMeta>,
): Promise<T> {
  const row = {
    ...data,
    id: (data as { id?: string }).id ?? crypto.randomUUID(),
    _localId: crypto.randomUUID(),
    _dirty: 1,
    last_modified_at: now(),
    deleted_at: null,
  } as unknown as T;
  await db.transaction("rw", table, db.outbox, async () => {
    await table.put(row);
    await enqueue(tableName, row._localId, "insert");
  });
  return row;
}

/** Patch an existing row and re-mark it dirty. */
export async function updateRow<T extends SyncMeta>(
  tableName: string,
  table: WriteThroughTable<T>,
  localId: string,
  changes: Partial<Omit<T, keyof SyncMeta>>,
): Promise<void> {
  const patch = {
    ...changes,
    _dirty: 1,
    last_modified_at: now(),
  } as Partial<T>;
  await db.transaction("rw", table, db.outbox, async () => {
    await updateByLocalId(table, localId, patch);
    await enqueue(tableName, localId, "update");
  });
}

/** Soft-delete: stamp `deleted_at`, keep the row, enqueue a delete op (§6). */
export async function softDeleteRow<T extends SyncMeta>(
  tableName: string,
  table: WriteThroughTable<T>,
  localId: string,
): Promise<void> {
  const patch = {
    deleted_at: now(),
    _dirty: 1,
    last_modified_at: now(),
  } as Partial<T>;
  await db.transaction("rw", table, db.outbox, async () => {
    await updateByLocalId(table, localId, patch);
    await enqueue(tableName, localId, "delete");
  });
}
