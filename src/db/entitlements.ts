/**
 * Durable, offline-readable cache of one member's last-known entitlements —
 * mirrors how members.ts caches the signed-in member's own profile/JWT. Written
 * whenever a fresh fetch succeeds; read directly for UI that needs an answer
 * with zero network (e.g. after a full app reload while offline). Not synced
 * through the outbox/_dirty pipeline — read-only cache, same as Member.
 */
export interface OrgEntitlement {
  organizationId: string;
  role: string;
  permissions: string[];
}

export interface StoreEntitlement {
  storeId: string;
  organizationId: string | null;
  role: string;
  permissions: string[];
}

export interface CachedEntitlements {
  memberId: string;
  platformRole: "platform_admin" | null;
  organizations: OrgEntitlement[];
  stores: StoreEntitlement[];
  cached_at: string;
}
