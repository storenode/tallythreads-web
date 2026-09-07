/**
 * Push side of offline sync (constitution §2.I / §6): drain the Dexie outbox to
 * Supabase. Reads run through the member-JWT `supabase` client, so RLS is enforced
 * exactly as for any online write.
 *
 * Entries are processed in FK-dependency order — a child upsert only passes once
 * its parent exists server-side:
 *
 *   purchase_trips → purchase_invoices → (purchase_invoice_items, trip_expenses)
 *
 * A child whose parent hasn't been pushed yet simply fails this cycle (attempts++,
 * entry kept) and succeeds on a later cycle once the parent is up. No entry is ever
 * hard-deleted here except after a confirmed server write.
 */
import { db } from "@/db";
import type { OutboxItem } from "@/db";
import { supabase } from "@/lib/supabaseClient";
import { getWatermark, setWatermark } from "./watermarks";

// Parent-before-child. `purchase_invoice_items` and `trip_expenses` are peers
// (both depend only on rows above them), so their relative order is irrelevant.
const PUSH_ORDER = [
  "purchase_trips",
  "purchase_invoices",
  "purchase_invoice_items",
  "trip_expenses",
  "trip_activities",
] as const;

type PushTable = (typeof PUSH_ORDER)[number];

// Dexie table handles, keyed by the outbox `table` string. Everything routed here
// is `_localId`-keyed and carries SyncMeta.
const DEXIE_TABLE = {
  purchase_trips: db.purchase_trips,
  purchase_invoices: db.purchase_invoices,
  purchase_invoice_items: db.purchase_invoice_items,
  trip_expenses: db.trip_expenses,
  trip_activities: db.trip_activities,
} as const;

/** Local-only bookkeeping columns that must never reach the server. */
const LOCAL_ONLY_FIELDS = ["_localId", "_dirty"] as const;

function toServerPayload(row: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if ((LOCAL_ONLY_FIELDS as readonly string[]).includes(key)) continue;
    payload[key] = value;
  }
  // No server id yet → let Postgres generate one on insert (id comes back via
  // .select()). `deleted_at`, when set, rides along as a normal column update —
  // that IS the soft-delete.
  if (payload.id == null) delete payload.id;
  return payload;
}

async function pushEntry(entry: OutboxItem): Promise<void> {
  const tableName = entry.table as PushTable;
  const dexieTable = DEXIE_TABLE[tableName];
  if (!dexieTable) return; // not a table this engine owns

  const row = await (
    dexieTable.get as (key: string) => Promise<Record<string, unknown> | undefined>
  )(entry.localId);

  // Row vanished locally (e.g. superseded) — drop the stale outbox entry.
  if (!row) {
    if (entry.id != null) await db.outbox.delete(entry.id);
    return;
  }

  const payload = toServerPayload(row);
  const { data, error } = await supabase
    .from(tableName)
    .upsert(payload)
    .select()
    .single();

  if (error) {
    // Parent not yet on the server, transient network/RLS races, etc. Keep the
    // entry and bump the counter; the next cycle retries in dependency order.
    if (entry.id != null) {
      await db.outbox.update(entry.id, { attempts: entry.attempts + 1 });
    }
    return;
  }

  // Confirmed server write: clear the dirty flag (and adopt the server id if this
  // was a first insert), then retire the outbox entry.
  const serverId = (data as { id?: string } | null)?.id;
  await (
    dexieTable.update as (
      key: string,
      changes: Record<string, unknown>,
    ) => Promise<number>
  )(entry.localId, {
    _dirty: 0,
    ...(serverId != null && row.id == null ? { id: serverId } : {}),
  });
  if (entry.id != null) await db.outbox.delete(entry.id);
}

/**
 * One push cycle. Returns the number of outbox entries still pending afterwards
 * (0 = fully drained). Call again on a timer / on reconnect until it reaches 0.
 */
export async function drainOutbox(): Promise<number> {
  const pending = await db.outbox.orderBy("queued_at").toArray();

  const byTable = new Map<string, OutboxItem[]>();
  for (const entry of pending) {
    const list = byTable.get(entry.table) ?? [];
    list.push(entry);
    byTable.set(entry.table, list);
  }

  for (const tableName of PUSH_ORDER) {
    for (const entry of byTable.get(tableName) ?? []) {
      await pushEntry(entry);
    }
  }

  return db.outbox.count();
}

// ─── Pull: changed rows, server → Dexie ──────────────────────────────

type LooseTable = {
  put(row: Record<string, unknown>): Promise<unknown>;
  where(index: string): {
    equals(value: string): {
      first(): Promise<Record<string, unknown> | undefined>;
    };
  };
};
const loose = (t: unknown) => t as LooseTable;

/**
 * Pull one table: every row with `last_modified_at` past our watermark —
 * soft-deleted rows included, so deletions propagate. Last-write-wins merge:
 * a locally-dirty row that is newer than the server's copy is kept (it will be
 * pushed); otherwise the server row is written with `_dirty=0`. A server row
 * carrying `deleted_at` lands as-is, marking the local row deleted.
 */
async function pullTable(tableName: PushTable): Promise<void> {
  const since = getWatermark(tableName);
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .gt("last_modified_at", since)
    .order("last_modified_at", { ascending: true });

  if (error || !data) return;

  const table = loose(DEXIE_TABLE[tableName]);
  let maxSeen = since;

  for (const serverRow of data as Record<string, unknown>[]) {
    const serverLmA = String(serverRow.last_modified_at ?? "");
    if (serverLmA > maxSeen) maxSeen = serverLmA;

    const local = await table
      .where("id")
      .equals(serverRow.id as string)
      .first();

    // Local pending edit newer than the server's copy → keep local, it pushes.
    if (
      local &&
      local._dirty === 1 &&
      String(local.last_modified_at) > serverLmA
    ) {
      continue;
    }

    await table.put({
      ...serverRow,
      _localId: (local?._localId as string | undefined) ?? (serverRow.id as string),
      _dirty: 0,
    });
  }

  setWatermark(tableName, maxSeen);
}

// ─── Orchestration: one full cycle, with an onLine guard + a lock ────

export interface SyncStatus {
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
}

let status: SyncStatus = { syncing: false, lastSyncAt: null, lastError: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getSyncStatus = (): SyncStatus => status;

let running = false;

/**
 * Push then pull, once. No-ops when offline or when a run is already in flight
 * (single in-process lock — triggers can fire freely). Never throws.
 */
export async function runSync(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  running = true;
  status = { ...status, syncing: true, lastError: null };
  emit();

  try {
    await drainOutbox();
    for (const tableName of PUSH_ORDER) {
      await pullTable(tableName);
    }
    status = { syncing: false, lastSyncAt: Date.now(), lastError: null };
  } catch (err) {
    status = {
      ...status,
      syncing: false,
      lastError: err instanceof Error ? err.message : String(err),
    };
  } finally {
    running = false;
    emit();
  }
}
