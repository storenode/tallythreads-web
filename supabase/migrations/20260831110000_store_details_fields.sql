-- Adds the store-level "store info" fields M1-schema-reference.md flagged as TBD
-- ("GSTIN, address, and other business-registration fields are not yet speced at
-- the store level"). Mirrors the equivalent organizations columns (20260830000000)
-- in naming, and country's 'India' default, so a chain's per-branch address doesn't
-- have to duplicate the org's own registered address when it legitimately differs.
-- GSTIN in particular is independent per store, not inherited from the org — the
-- doc's own open question was a multi-state chain needing a distinct GSTIN per
-- branch, which is exactly what this column is for; a single-state operator can
-- just leave it blank and rely on the org's GSTIN. opening_time/closing_time are
-- the one speculative addition here: nothing downstream reads them yet (POS/M5
-- isn't built), but they're cheap to add alongside the rest of the store-info
-- fields while this table is already being extended.
--
-- All nullable except country (defaulted, not required) — every field here is
-- optional on both the create and edit forms.

alter table stores
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column state text,
  add column pincode text,
  add column country text default 'India',
  add column phone_number text,
  add column email text,
  add column gstin text,
  add column opening_time time,
  add column closing_time time;

comment on table stores is
  'A physical (or virtual) selling point, owned by an organization. Gained a full '
  'store-info field set (address, contact, GSTIN, hours) in v1.5.0 — see '
  'M1-schema-reference.md.';
