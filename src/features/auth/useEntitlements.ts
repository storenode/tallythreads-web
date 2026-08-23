import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useMember } from "@/features/auth/useMember";
import {
  resolveEntitlements,
  hasPermission as hasPermissionPure,
  type Entitlements,
  type EntitlementsSource,
  type PermissionScope,
} from "@/lib/entitlements";

export interface EntitlementsState {
  entitlements: Entitlements | undefined;
  isLoading: boolean;
  /** Convenience wrapper over the pure `hasPermission` bound to this session's fetched rows. */
  hasPermission: (permission: string, scope: PermissionScope) => boolean;
}

const EMPTY_SOURCE: EntitlementsSource = {
  memberships: [],
  roles: [],
  permissions: [],
  rolePermissions: [],
  stores: [],
};

// Module-level, keyed by member id — "once per session" per M1b §4 subtask 6, not
// once per component mount. A remount (e.g. navigating between /app screens) reuses
// the same fetch instead of re-querying; a different member signing in on the same
// device (see memberSession.ts's multi-member cache) gets its own fetch.
const sessionCache = new Map<string, EntitlementsSource>();

const log = (...args: unknown[]) => console.log("[useEntitlements]", ...args);

/**
 * Fetches one member's own rows (their memberships, plus the small roles/permissions/
 * role_permissions/stores reference tables) and caches them by member id. Exported as
 * a plain async function — not just via the useEntitlements() hook below — because
 * the post-sign-in redirect (LoginPage/SetPinPage) needs the answer imperatively,
 * before it can decide where to navigate, not just for a render-time UI decision.
 *
 * Goes through the get-entitlements Edge Function rather than direct supabase.from()
 * REST calls: this Supabase project has no legacy JWT secret configured, so PostgREST
 * only trusts its own asymmetric signing keys and rejects our TallyThreads-minted member
 * JWT outright (PGRST301/401 on every table). The Edge Function verifies that same JWT
 * itself (plain HS256, unrelated to PostgREST) and reads with the service-role key —
 * see get-entitlements/index.ts for the full explanation.
 */
export async function fetchEntitlementsSource(memberId: string): Promise<EntitlementsSource> {
  log("fetchEntitlementsSource called for memberId =", memberId);

  const cached = sessionCache.get(memberId);
  if (cached) {
    log("cache hit, returning cached source", cached);
    return cached;
  }

  log("cache miss, invoking get-entitlements");
  const { data, error } = await supabase.functions.invoke<EntitlementsSource>(
    "get-entitlements",
    { method: "POST" },
  );

  log("get-entitlements ->", { data, error });

  if (error || !data) {
    console.error("[useEntitlements] get-entitlements failed, failing closed", error);
    // Fail closed: an empty source resolves to no permissions anywhere, never a
    // default-allow — see resolveEntitlements' zero-memberships scenario.
    sessionCache.set(memberId, EMPTY_SOURCE);
    return EMPTY_SOURCE;
  }

  log("resolved source ->", data);
  sessionCache.set(memberId, data);
  return data;
}

/** Imperative counterpart to useEntitlements() — for the post-sign-in redirect decision. */
export async function fetchEntitlements(memberId: string): Promise<Entitlements> {
  const source = await fetchEntitlementsSource(memberId);
  const entitlements = resolveEntitlements(memberId, source);
  log("resolveEntitlements ->", entitlements);
  return entitlements;
}

/**
 * Render-time read of the same data, once per member session. This is the client's
 * read of "what should I show" — never the authorization boundary itself (M1b §4):
 * every mutating Edge Function re-derives its own answer server-side from the same
 * underlying logic, since a cached client snapshot can't be trusted for that.
 */
export function useEntitlements(): EntitlementsState {
  const { member, isLoading: isMemberLoading } = useMember();
  const memberId = member?.id;

  const [source, setSource] = useState<EntitlementsSource | undefined>(
    memberId ? sessionCache.get(memberId) : undefined,
  );
  const [isFetching, setIsFetching] = useState(false);
  const fetchedForMemberId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!memberId) {
      fetchedForMemberId.current = undefined;
      setSource(undefined);
      return;
    }

    const cached = sessionCache.get(memberId);
    if (cached) {
      setSource(cached);
      return;
    }

    if (fetchedForMemberId.current === memberId) return; // already in flight
    fetchedForMemberId.current = memberId;

    let cancelled = false;
    setIsFetching(true);

    fetchEntitlementsSource(memberId).then((resolved) => {
      if (cancelled) return;
      setSource(resolved);
      setIsFetching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const entitlements =
    memberId && source ? resolveEntitlements(memberId, source) : undefined;

  return {
    entitlements,
    isLoading: isMemberLoading || (Boolean(memberId) && !source) || isFetching,
    hasPermission: (permission, scope) =>
      memberId && source
        ? hasPermissionPure(memberId, permission, scope, source)
        : false,
  };
}
