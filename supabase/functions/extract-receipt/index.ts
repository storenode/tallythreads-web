// extract-receipt
//
// First real Claude API integration (constitution v1.13.0 §8). Takes a camera photo of a
// supplier receipt/invoice from a Purchase-Trip's active phase and returns a structured
// JSON draft invoice. The owner ALWAYS reviews/edits before confirming — this never
// writes an invoice directly and its numbers are never auto-trusted (§2.V).
//
// Auth: the caller's TallyThreads member JWT (same as set-pin/verify-pin). Gated to
// members who can actually run trips (platform_admin or a role granting trip.create) so
// the paid API can't be hit by any signed-in account.
//
// Secrets (server-side only): ANTHROPIC_API_KEY (set via `supabase secrets set`), plus the
// auto-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and the existing APP_JWT_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyMemberJwt } from "../_shared/jwt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const MODEL = "claude-haiku-4-5";
const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// ~5 MB decoded ≈ 6.9M base64 chars — Anthropic's per-image ceiling. Reject bigger.
const MAX_B64_CHARS = 7_000_000;

const SYSTEM_PROMPT = `You extract data from a photographed supplier invoice/receipt for an
Indian cloth/garment retailer's buying trip. Read the image and return ONLY a single JSON
object (no prose, no markdown fences) with EXACTLY this shape:

{
  "supplier_name": string | null,
  "supplier_gstin": string | null,
  "supplier_invoice_no": string | null,
  "invoice_date": string | null,            // ISO "YYYY-MM-DD" if determinable, else null
  "items": [
    { "description": string, "quantity": number, "unit_cost": number, "taxable_value": number, "line_total": number }
  ],
  "subtotal": number | null,
  "tax": number | null,
  "grand_total": number | null,
  "confidence": "high" | "medium" | "low",
  "notes": string | null                    // anything unclear/unreadable
}

Rules:
- All money values are in Indian RUPEES as plain numbers (e.g. 1234.50), NOT paise, NOT strings.
- \`unit_cost\` is the PER-UNIT pre-tax price. On Indian GST invoices this is the "Rate"
  column (the price for ONE piece), NOT the line total and NOT the GST-inclusive amount.
- \`taxable_value\` is the pre-tax line value (usually Quantity × Rate, the "Taxable Value"
  column). \`line_total\` is the GST-inclusive line amount ("Total Amount"). \`tax\` /
  \`subtotal\` / \`grand_total\` are the invoice totals.
- If \`unit_cost\` isn't printed, leave it null but DO fill \`taxable_value\` — the app derives
  unit_cost = taxable_value / quantity. Never put a GST-inclusive figure in \`unit_cost\`.
- EXCLUDE non-goods charge lines (Transport, Freight, Courier, Packing, Loading) from
  \`items\` — they are charges, not stock.
- Use null for any field you cannot read. Do NOT invent a GSTIN or invoice number.
- If the image is not a receipt/invoice, return the shape with empty items, confidence "low",
  and a note. Return the JSON object and nothing else.`;

interface RoleEmbed {
  name: string;
  role_permissions: { permissions: { key: string } | null }[] | null;
}
interface MembershipEmbed {
  roles: RoleEmbed | null;
}

async function canRunTrips(admin: ReturnType<typeof createClient>, memberId: string) {
  const { data, error } = await admin
    .from("memberships")
    .select("roles(name, role_permissions(permissions(key)))")
    .eq("member_id", memberId)
    .is("deleted_at", null)
    .returns<MembershipEmbed[]>();
  if (error) throw error;
  return (data ?? []).some(
    (m) =>
      m.roles?.name === "platform_admin" ||
      (m.roles?.role_permissions ?? []).some(
        (rp) => rp.permissions?.key === "trip.create",
      ),
  );
}

function toPaise(rupees: unknown): number | null {
  if (typeof rupees !== "number" || !Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }
  let memberId: string;
  try {
    memberId = await verifyMemberJwt(authHeader.slice("Bearer ".length));
  } catch (e) {
    return json(
      { error: `Invalid or expired session: ${e instanceof Error ? e.message : e}` },
      401,
    );
  }

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing env vars (ANTHROPIC_API_KEY / SUPABASE_URL / SERVICE_ROLE_KEY)");
    return json({ error: "Function misconfigured (missing env vars)" }, 500);
  }

  let imageB64: string | undefined;
  let mediaType: string | undefined;
  try {
    const body = await req.json();
    imageB64 = typeof body?.image_base64 === "string" ? body.image_base64 : undefined;
    mediaType = typeof body?.media_type === "string" ? body.media_type : undefined;
  } catch {
    // fallthrough
  }
  if (!imageB64 || !mediaType) {
    return json({ error: "Missing image_base64 or media_type" }, 400);
  }
  if (!ALLOWED_MEDIA.includes(mediaType)) {
    return json({ error: `Unsupported media_type. Allowed: ${ALLOWED_MEDIA.join(", ")}` }, 400);
  }
  if (imageB64.length > MAX_B64_CHARS) {
    return json({ error: "Image too large (max ~5 MB). Retake at lower resolution." }, 413);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (!(await canRunTrips(admin, memberId))) {
      return json({ error: "Not authorised to scan trip receipts" }, 403);
    }
  } catch (e) {
    console.error("permission check failed", e);
    return json({ error: "Permission check failed" }, 500);
  }

  // Call Anthropic Messages API (vision). Raw fetch — no SDK needed in Deno.
  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageB64 },
              },
              {
                type: "text",
                text: "Extract this receipt into the JSON object described. Return only the JSON.",
              },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    console.error("anthropic fetch failed", e);
    return json({ error: "Could not reach the extraction service" }, 502);
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text();
    console.error("anthropic error", anthropicRes.status, detail);
    // Surface the Anthropic status + message so the client/owner can see the real cause
    // (invalid key, unknown model, insufficient credit, rate limit, etc.). This is the
    // owner's own function — no sensitive data in an API error string.
    return json(
      { error: "Extraction service error", status: anthropicRes.status, detail: detail.slice(0, 400) },
      502,
    );
  }

  const payload = await anthropicRes.json();
  const text: string =
    (payload?.content ?? [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("\n") ?? "";

  let raw: Record<string, unknown>;
  try {
    raw = extractJson(text);
  } catch (e) {
    console.error("parse failed", e, text.slice(0, 500));
    return json({ error: "Could not read the receipt clearly — enter it manually." }, 422);
  }

  // Normalise to integer paise; the owner reviews/edits before confirming.
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map((it: Record<string, unknown>) => {
    const quantity = typeof it?.quantity === "number" ? it.quantity : null;
    const taxablePaise = toPaise(it?.taxable_value);
    const lineTotalPaise = toPaise(it?.line_total);
    // Prefer the model's unit_cost; else derive per-unit from the pre-tax taxable value
    // (falling back to the line total only if taxable is absent) so it's never lost.
    let unitCostPaise = toPaise(it?.unit_cost);
    if (unitCostPaise == null && quantity && quantity > 0) {
      if (taxablePaise != null) unitCostPaise = Math.round(taxablePaise / quantity);
      else if (lineTotalPaise != null) unitCostPaise = Math.round(lineTotalPaise / quantity);
    }
    return {
      description: typeof it?.description === "string" ? it.description : "",
      quantity,
      unit_cost_paise: unitCostPaise,
      line_total_paise: lineTotalPaise,
    };
  });

  const invoice = {
    supplier_name: typeof raw.supplier_name === "string" ? raw.supplier_name : null,
    supplier_gstin: typeof raw.supplier_gstin === "string" ? raw.supplier_gstin : null,
    supplier_invoice_no:
      typeof raw.supplier_invoice_no === "string" ? raw.supplier_invoice_no : null,
    invoice_date: typeof raw.invoice_date === "string" ? raw.invoice_date : null,
    items,
    subtotal_paise: toPaise(raw.subtotal),
    tax_paise: toPaise(raw.tax),
    grand_total_paise: toPaise(raw.grand_total),
    confidence: typeof raw.confidence === "string" ? raw.confidence : "low",
    notes: typeof raw.notes === "string" ? raw.notes : null,
  };

  return json({ invoice, model: MODEL, usage: payload?.usage ?? null });
}

Deno.serve(handle);
