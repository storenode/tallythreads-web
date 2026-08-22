/**
 * Manages the Dexie-cached member session(s) — deliberately Dexie-only, not
 * localStorage: with multi-member shared-device support (M1a), the JWT is no longer
 * a single global value, it's per-cached-member, so it lives on the Dexie row itself.
 * See specs/tasks/M1a-identity-auth.md (Dexie multi-member note).
 */

import { db, type Member } from "@/db";

type CacheableMember = Omit<Member, "jwt" | "is_active" | "cached_at">;

/**
 * Caches (or refreshes) one member's session as the *active* one, deactivating any
 * other cached member on this device — an intentional "switch user" handoff, not a
 * deletion: the previously active member's own row/JWT/PIN enrollment is untouched
 * server-side and remains switchable-back-to later.
 */
export async function cacheActiveMember(member: CacheableMember, jwt: string): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction("rw", db.members, async () => {
    await db.members.where("is_active").equals(1).modify({ is_active: 0 });
    await db.members.put({ ...member, jwt, is_active: 1, cached_at: now });
  });
}

/** Clears (deletes) only the currently active member's cached row — sign-out. */
export async function clearActiveMember(): Promise<void> {
  await db.members.where("is_active").equals(1).delete();
}

async function getActiveMember(): Promise<Member | undefined> {
  return db.members.where("is_active").equals(1).first();
}

/** Used by supabaseClient's `accessToken` callback — must stay async-safe. */
export async function getMemberJwt(): Promise<string | null> {
  const active = await getActiveMember();
  return active?.jwt ?? null;
}
