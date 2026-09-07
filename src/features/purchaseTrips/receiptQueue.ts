import { supabase } from "@/lib/supabaseClient";
import { db } from "@/db";
import {
  createPurchaseInvoice,
  createPurchaseInvoiceItem,
  createTripActivity,
} from "./data";
import { formatInr } from "@/lib/money";

/** Shape returned by the extract-receipt Edge Function (amounts already in paise). */
export interface ExtractedInvoice {
  supplier_name: string | null;
  supplier_gstin: string | null;
  supplier_invoice_no: string | null;
  invoice_date: string | null;
  items: {
    description: string;
    quantity: number | null;
    unit_cost_paise: number | null;
    line_total_paise: number | null;
  }[];
  subtotal_paise: number | null;
  tax_paise: number | null;
  grand_total_paise: number | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

/** Call the Claude vision Edge Function to turn a receipt image into a draft invoice. */
export async function extractReceipt(
  imageBase64: string,
  mediaType: string,
): Promise<ExtractedInvoice> {
  const { data, error } = await supabase.functions.invoke<{ invoice: ExtractedInvoice }>(
    "extract-receipt",
    { body: { image_base64: imageBase64, media_type: mediaType } },
  );
  if (error) {
    // supabase-js throws a generic "non-2xx status code" — dig the function's real
    // {error, status, detail} out of the response so the owner sees the actual cause.
    let msg = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json();
        msg = [body?.error, body?.status, body?.detail].filter(Boolean).join(" · ") || msg;
      } catch {
        /* keep generic message */
      }
    }
    throw new Error(msg);
  }
  if (!data?.invoice) throw new Error("No invoice returned");
  return data.invoice;
}

function base64ToBlob(b64: string, mediaType: string): Blob {
  const chars = atob(b64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

/** Upload a receipt image to the private `receipts` bucket. Returns the object path, or
 * null on failure (non-fatal — the extraction is the real value, the image is for audit).
 * Path shape `{orgId}/{tripId}/{uuid}.ext` matches the bucket's RLS. */
export async function uploadReceipt(
  orgId: string,
  tripId: string,
  base64: string,
  mediaType: string,
): Promise<string | null> {
  try {
    const ext = mediaType === "image/png" ? "png" : "jpg";
    const path = `${orgId}/${tripId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("receipts")
      .upload(path, base64ToBlob(base64, mediaType), { contentType: mediaType });
    if (error) {
      console.warn("receipt upload failed", error);
      return null;
    }
    return path;
  } catch (e) {
    console.warn("receipt upload error", e);
    return null;
  }
}

/**
 * Persist an extracted (or owner-edited) draft as a real purchase_invoice + its items,
 * offline-first via write-through, and log a `receipt_scan` activity. `needs_review` is
 * true for deferred/offline scans (nobody reviewed them at capture); false when the owner
 * explicitly approved.
 */
export async function saveExtractedInvoice(
  tripId: string,
  inv: ExtractedInvoice,
  opts: {
    source: "ai_scan";
    needsReview: boolean;
    receiptPath?: string | null;
    memberId?: string | null;
  },
): Promise<void> {
  const supplier = inv.supplier_name?.trim() || "Unknown supplier";
  const invoice = await createPurchaseInvoice({
    trip_id: tripId,
    supplier_name: supplier,
    supplier_gstin: inv.supplier_gstin,
    supplier_invoice_no: inv.supplier_invoice_no,
    invoice_date: inv.invoice_date,
    margin_config: { type: "flat", pct: 0.2 }, // sensible default; owner can change
    margin_plugin_id: null,
    notes: inv.notes,
    source: opts.source,
    receipt_path: opts.receiptPath ?? null,
    ai_confidence: inv.confidence,
    needs_review: opts.needsReview,
  });

  for (const item of inv.items) {
    if (!item.description?.trim()) continue;
    await createPurchaseInvoiceItem({
      invoice_id: invoice.id!,
      description: item.description.trim(),
      hsn_code: null,
      quantity: item.quantity && item.quantity > 0 ? Math.round(item.quantity) : 1,
      unit_cost_paise: item.unit_cost_paise ?? 0,
      is_trending: false,
    });
  }

  const total = inv.grand_total_paise != null ? ` ${formatInr(inv.grand_total_paise)}` : "";
  await createTripActivity({
    trip_id: tripId,
    member_id: opts.memberId ?? null,
    kind: "receipt_scan",
    note: `Scanned receipt: ${supplier}${total}`,
    ref_invoice_id: invoice.id ?? null,
    occurred_at: new Date().toISOString(),
  });
}

/** Queue a receipt image captured offline, to extract on reconnect. */
export async function queuePendingReceipt(
  tripId: string,
  imageBase64: string,
  mediaType: string,
): Promise<void> {
  await db.pending_receipts.add({
    trip_id: tripId,
    image_base64: imageBase64,
    media_type: mediaType,
    created_at: new Date().toISOString(),
    attempts: 0,
  });
}

/**
 * Process queued offline receipts: extract each via Claude and save it as an ai_scan
 * invoice flagged needs_review (the owner reviews these later — they weren't reviewed at
 * capture time because there was no connection). No-op when offline. Returns how many
 * were processed.
 */
let draining = false;

export async function drainPendingReceipts(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  if (draining) return 0; // single-flight: safe to call from multiple triggers
  draining = true;
  try {
    const pending = await db.pending_receipts.orderBy("created_at").toArray();
    let processed = 0;

    for (const row of pending) {
      try {
        const inv = await extractReceipt(row.image_base64, row.media_type);
        // Look up the trip's org so the receipt image can be stored under the right path.
        const tripRow = await db.purchase_trips
          .filter((t) => t.id === row.trip_id)
          .first();
        const receiptPath = tripRow?.organization_id
          ? await uploadReceipt(
              tripRow.organization_id,
              row.trip_id,
              row.image_base64,
              row.media_type,
            )
          : null;
        // Deferred scans are always flagged for review — nobody eyeballed them at capture.
        await saveExtractedInvoice(row.trip_id, inv, {
          source: "ai_scan",
          needsReview: true,
          receiptPath,
        });
        if (row.id != null) await db.pending_receipts.delete(row.id);
        processed++;
      } catch (e) {
        // Leave it queued; record why so the owner/dev can see it, and retry later.
        if (row.id != null) {
          await db.pending_receipts.update(row.id, {
            attempts: row.attempts + 1,
            last_error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    return processed;
  } finally {
    draining = false;
  }
}
