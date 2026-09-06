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

<!-- Add new deferred items below, newest first, using the same What / Why parked /
     Trigger / Related shape. -->
