/**
 * Per-table pull watermark: the newest `last_modified_at` we've already pulled
 * from the server. Stored in localStorage — device-local, survives reloads, reset
 * on sign-out is unnecessary (RLS re-filters on the next pull anyway).
 */
const KEY = (table: string) => `sync:watermark:${table}`;

// Epoch — first pull fetches everything visible under RLS.
const EPOCH = "1970-01-01T00:00:00.000Z";

export function getWatermark(table: string): string {
  try {
    return localStorage.getItem(KEY(table)) ?? EPOCH;
  } catch {
    return EPOCH;
  }
}

export function setWatermark(table: string, value: string): void {
  try {
    if (value > getWatermark(table)) localStorage.setItem(KEY(table), value);
  } catch {
    /* private-mode / quota — pull just re-fetches next time */
  }
}
