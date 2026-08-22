import { useLiveQuery } from "dexie-react-hooks";
import { db, type Member } from "@/db";

export interface MemberState {
  member: Member | undefined;
  isLoading: boolean;
  isSignedIn: boolean;
}

const PENDING = Symbol("pending");

/**
 * Offline-capable: reads the cached *active* member profile straight from Dexie, no
 * network call. The JWT lives on the row itself (see memberSession.ts), so a member
 * counts as signed in whenever an active row exists at all.
 *
 * Uses a distinct PENDING sentinel as the useLiveQuery default, rather than
 * `undefined` — an empty (never-signed-in) result is also `undefined` once the query
 * resolves, so `undefined` alone can't distinguish "still loading" from "no member".
 */
export function useMember(): MemberState {
  const result = useLiveQuery<Member | null, typeof PENDING>(
    () => db.members.where("is_active").equals(1).first().then((m) => m ?? null),
    [],
    PENDING,
  );

  const isLoading = result === PENDING;
  const member = isLoading || result === null ? undefined : result;
  const isSignedIn = Boolean(member?.jwt);

  return { member, isLoading, isSignedIn };
}
