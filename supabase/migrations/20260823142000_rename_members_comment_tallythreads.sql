-- Follow-up to the StoreParda -> TallyThreads product rename. The original comment
-- from 20260820001601_create_members.sql is left untouched (already-applied migration
-- files are historical record, not edited after the fact) — this just updates the live
-- comment to match, the same way any other later ALTER would.
comment on table members is 'TallyThreads member identities, keyed on Google''s stable sub claim. Not linked to auth.users.';
