import type { SyncMeta } from "./types";

export interface PurchaseInvoice extends SyncMeta {
  id?: string;
  trip_id: string;
  supplier_name: string;
  supplier_gstin: string | null;
  supplier_invoice_no: string | null;
  invoice_date: string | null;
  // data-driven recipe OR a coded plugin key — at most one is set.
  margin_config: Record<string, unknown> | null;
  margin_plugin_id: string | null;
  notes: string | null;
  // Active-phase / AI-scan provenance (M4).
  source: "manual" | "ai_scan";
  receipt_path: string | null; // Supabase Storage object path for a scanned receipt
  ai_confidence: "high" | "medium" | "low" | null;
  needs_review: boolean; // low/medium-confidence scan → owner should eyeball
  // When this invoice's parcel physically arrived at the store (null = not yet received).
  // Doubles as the received-at timestamp for the receiving pipeline below.
  arrived_at: string | null;
  // Receiving pipeline (the Deliveries module): in_transit → received → verified → approved.
  // `approved` hands off to the future inventory module (M3), which creates the actual stock.
  receiving_status:
    | "pending"
    | "in_transit"
    | "received"
    | "verified"
    | "ready_for_inventory";
  verified_at: string | null;
  approved_at: string | null;
}
