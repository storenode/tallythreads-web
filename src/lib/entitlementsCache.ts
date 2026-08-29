import { db } from "@/db";
import type { Entitlements } from "@/features/auth/entitlements";

export async function cacheEntitlements(
  memberId: string,
  entitlements: Entitlements,
): Promise<void> {
  await db.entitlements.put({
    memberId,
    ...entitlements,
    cached_at: new Date().toISOString(),
  });
}

export async function getCachedEntitlements(
  memberId: string,
): Promise<Entitlements | undefined> {
  const row = await db.entitlements.get(memberId);
  if (!row) return undefined;
  const { memberId: _drop, cached_at: _drop2, ...entitlements } = row;
  return entitlements;
}

export async function clearEntitlements(memberId: string): Promise<void> {
  await db.entitlements.delete(memberId);
}
