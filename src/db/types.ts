/**
 * Fields every synced entity carries. Cache-only tables (e.g. {@link Member})
 * deliberately do NOT extend this — they're written directly from an API
 * response, not through the outbox/_dirty push pipeline.
 */
export interface SyncMeta {
  _localId: string;
  _dirty: 0 | 1;
  last_modified_at: string;
  deleted_at: string | null;
}
