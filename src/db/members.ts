/**
 * Cache slot(s) for signed-in members' own profiles — not a general members table
 * sync (that's M2's job). Written directly from mint-member-session/verify-pin's
 * response, not through the outbox/_dirty push pipeline.
 *
 * Keyed on `id` (the real `members.id`, not a synthetic local id) so **more than one
 * member can be cached at once** — a shared store counter laptop/tablet used by
 * several staff each gets their own cached row, none of which evict each other.
 * Exactly one cached row has `is_active: 1` at a time — the member `/app/*` currently
 * renders as. The JWT lives directly on the row (not in a separate localStorage key)
 * so it's naturally per-member rather than a single global value. See
 * specs/tasks/M1a-identity-auth.md (Dexie multi-member note) and
 * specs/tasks/M1-auth-google.md.
 */
export interface Member {
  id: string;
  google_id: string;
  google_email: string;
  email_verified: boolean;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  jwt: string;
  is_active: 0 | 1;
  cached_at: string;
}
