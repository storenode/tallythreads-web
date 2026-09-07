# Backlog — deferred & parked ideas

Ideas that are agreed to be worth doing but **deliberately postponed** — not open
questions, not active scope. Each item says what it is, why it's parked, and what would
trigger building it. Pull an item out of here into a real spec/phase when its trigger hits.

---

## Purchase-Trip: break-even / ROI forecast

**What:** In the trip *planning* phase, forecast the owner's return on investment — from a
planned budget + estimated expenses + expected margin + a sell-through assumption, project
expected profit and an estimated **break-even date** ("when does the money come back to my
pocket"). Would live in a `lib/tripForecast.ts` pure engine feeding the org-dashboard trip
planning view.

**Why parked (2026-09-05, founder decision):** postponed to a later feature implementation.
Also honestly limited until then — a *real* break-even needs actual sales data (M5), so
anything built now is a projection from assumptions, clearly labeled as an estimate, not a
guarantee.

**Trigger to build:** when Purchase-Trip planning is revisited for the forecast feature —
and it becomes genuinely accurate once M5 (Billing/POS) provides real sell-through data to
replace the assumed sell-through rate.

**Related:** `purchase-trips.md` (the module this attaches to); M5 seam for actuals.

---

## Purchase-Trip: place autocomplete / typo auto-correction (Photon or Google Places)

**What:** As the owner types From/To/Boarding, show a live suggestion dropdown that
tolerates spelling mistakes and captures lat/long — active auto-correction, instead of the
Phase-1 "type it + click Verify-on-map to eyeball it" (human detection).

**Options if/when built:** **Photon** (open-source, Apache 2.0, typo-tolerant, OSM data) via
its free public endpoint or self-hosted — the OSS-first, no-license-fee choice (§2.III);
**Google Places Autocomplete** — better India coverage but a **paid vendor** needing a §8
decision + cost review. Both need network (offline falls back to free text).

**Why parked (2026-09-05, founder decision):** Phase 1's generated free Maps verify-link +
free-text capture is enough to validate entries and ships with zero dependency. Autocomplete
is a UX upgrade, not required yet.

**Trigger to build:** owners find typing+verify too error-prone in practice, or a feature
needs structured lat/long. Prefer Photon first (OSS); Google Places only with a constitution
amendment for the paid vendor.

**Related:** `purchase-trips.md` (route table); the hotel-discovery item below.

---

## Purchase-Trip: hotel discovery & accommodation pricing

**What:** From the route's lat/long, suggest nearby hotels (rating, price tier, location)
and/or fill accommodation budget automatically.

**Why parked (2026-09-05, founder decision):** Google Places returns hotel name / rating /
location / a coarse `price_level` ($–$$$$) only — **not real ₹ nightly prices**. Real
bookable prices need a hotel-booking API (Booking.com / MakeMyTrip — separate, complex,
partner-access, paid), out of scope. For the *budget* the owner actually wants, the plan is
**Claude/Haiku estimates in Phase 2** (an estimate, clearly labeled), not Google.

**Trigger to build:** a real need for in-app hotel discovery, weighed against the
booking-API cost/complexity — and only after the Claude estimate proves insufficient.

**Related:** `purchase-trips.md` §3 (AI estimator, Phase 2); the Places item above.

---

## Purchase-Trip: AI trip-budget estimator (planning phase)

**What:** An "Estimate with AI ✨" button in the *planning* phase — sends the route legs
(from/to/mode/distance) + dates + party size to a server-side Claude (Haiku) function that
returns an itemized INR estimate (travel/lodging/food/local transport) to prefill
`estimated_expenses`. Editable, labeled "AI estimate", never a guarantee.

**Why parked (2026-09-06, founder decision):** needed, but not immediate — the priority is
completing the Purchase-Trip **active phase** end-to-end first. The active phase's Claude
use (receipt → JSON, see `purchase-trips.md`) is the higher-value first AI integration; the
planning estimator comes after.

**Trigger to build:** after the active-phase (receipt scanning) ships and the Claude API is
already adopted (key + §3/§8 amendment done) — the estimator then reuses the same plumbing.

**Related:** `purchase-trips.md` (planning phase; the receipt→JSON active-phase feature that
adopts the Claude API first).

---

## Store shelves / placement scheme (Direction + Row + Column)

**What:** A per-store, optional (Settings-time) provision to define shelf/rack locations —
a flexible `code` string (with a Direction+Row+Column *builder* as the friendly default,
e.g. `E-03-02`) stored in a `store_shelves` table — so in-store stock placement becomes a
pick-from-list (one shelf per (store, variant) for a start) instead of free text. Barcode
scan of an item → shows its shelf.

**Why parked (2026-09-06, founder decision):** discussed as part of the inventory
(goods-received → godown → distribute → place) flow, which is the **next module after
Purchase-Trip** (M3/M1c). Not part of the Purchase-Trip end-to-end flow, so deferred with
that module. Keep it optional/non-blocking at store registration.

**Trigger to build:** when the inventory / stock-distribution module (M3/M1c) starts.

**Related:** the inventory discussion (2026-09-05/06 journal); M3/M1c in `status.md`.

---

## Purchase-Trip: "Incoming Stock" offline support

**What:** The store-staff price-free Incoming Stock view (`/ops/:storeId/incoming`) reads
directly from the `incoming_stock` Supabase view (online-only). Cache it in Dexie so it also
works offline like the rest of the app.

**Why parked (2026-09-06):** it's a read-only convenience view for store staff; the whole
purchase-trip *authoring* flow is already offline-first. Not worth the sync plumbing (the
view spans org-derived rows, not a simple mirrored table) until offline store-staff use is
a real need.

**Trigger to build:** store staff report needing the incoming list without connectivity.

**Related:** `purchase-trips.md` §10; `reference/schema.md` (`incoming_stock` view).

---

## Purchase-Trip: active-phase polish (small deferred items)

**What (grouped):**
- A **viewer** to open a scanned receipt's stored image (`purchase_invoices.receipt_path`)
  for audit — today the image is stored in the `receipts` bucket but there's no UI to view it.
- **Edit a scanned invoice's margin recipe** in the detail UI — manual "Add invoice" has the
  flat/trending picker, but a scanned invoice defaults to flat 20% with no post-hoc edit.
- **Storage cleanup** — delete the receipt image from the `receipts` bucket when its invoice
  is soft-deleted (avoid orphan images).
- **Per-member rate-limit** on `extract-receipt` — the ~$5 Anthropic spend cap + the
  `trip.create` gate already bound abuse; a per-member/day cap would harden it further.

**Why parked (2026-09-06):** none blocks the end-to-end flow; each is a refinement.

**Trigger to build:** real usage surfaces the need (audit disputes → viewer; margin tweaks →
edit; storage bloat → cleanup; cost spikes → rate-limit).

**Related:** `purchase-trips.md` §2A; `supabase/functions/extract-receipt`.

---

<!-- Add new deferred items below, newest first, using the same What / Why parked /
     Trigger / Related shape. -->
