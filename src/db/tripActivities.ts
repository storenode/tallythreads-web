import type { SyncMeta } from "./types";

export type TripActivityKind =
  | "note"
  | "started"
  | "completed"
  | "arrived"
  | "expense"
  | "invoice"
  | "receipt_scan";

/** One entry in a trip's journey log (active phase). */
export interface TripActivity extends SyncMeta {
  id?: string;
  trip_id: string;
  member_id: string | null;
  kind: TripActivityKind;
  note: string | null;
  ref_invoice_id: string | null;
  occurred_at: string;
}
