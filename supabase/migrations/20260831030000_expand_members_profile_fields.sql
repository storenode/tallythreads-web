-- Adds the real-world staff-record fields a textile/retail store operator needs to
-- capture on a member at add-time: identity proof (Aadhaar + PAN as two distinct
-- fields — the realistic norm for Indian retail staff KYC, not a type-picker), a
-- contactable mobile number, an emergency contact, date of joining, and a
-- residential address. Driven by the new dedicated member-creation page (see
-- M-admin-org-module.md) replacing the old email-only "Invite Member" panel.
--
-- All nullable, no special RLS restriction (2026-08-31 scoping decision: "no special
-- restriction for now" on who can view these fields — same members-table read
-- policies as everything else on this table already apply). Bank account/IFSC
-- details are deliberately NOT included here — too sensitive to collect with no
-- payroll module yet to justify it.

alter table members
  add column mobile_number           text,
  add column aadhaar_number          text,
  add column pan_number              text,
  add column emergency_contact_name  text,
  add column emergency_contact_phone text,
  add column date_of_joining         date,
  add column address_line1           text,
  add column address_line2           text,
  add column city                    text,
  add column state                   text,
  add column pincode                 text;

comment on column members.mobile_number is
  'Contact number, distinct from google_email — the number staff are actually reachable on.';
comment on column members.aadhaar_number is
  'Aadhaar number, as its own field (not a type-picker) — the realistic norm for Indian retail staff KYC.';
comment on column members.pan_number is
  'PAN number, as its own field alongside aadhaar_number — see that column''s comment.';
comment on column members.emergency_contact_name is
  'Emergency contact''s name, captured at member-creation time.';
comment on column members.emergency_contact_phone is
  'Emergency contact''s phone number.';
comment on column members.date_of_joining is
  'Employment start date, as declared at member-creation time.';
comment on column members.address_line1 is 'Residential address line 1.';
comment on column members.address_line2 is 'Residential address line 2.';
comment on column members.city is 'Residential address city.';
comment on column members.state is 'Residential address state.';
comment on column members.pincode is 'Residential address pincode.';
