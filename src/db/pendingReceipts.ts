/**
 * A receipt photo captured while OFFLINE, waiting to be extracted by Claude on reconnect
 * (Purchase-Trip active phase, Option A). Local-only — NOT a synced table (no SyncMeta):
 * it never leaves this device; once extracted it becomes a real purchase_invoice (which
 * DOES sync) and the pending row is deleted.
 */
export interface PendingReceipt {
  id?: number;
  trip_id: string;
  image_base64: string;
  media_type: string;
  created_at: string;
  attempts: number;
  /** Last extraction failure message, for the owner to see + debug (set on drain error). */
  last_error?: string | null;
}
