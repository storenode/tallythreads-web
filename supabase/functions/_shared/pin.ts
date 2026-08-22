// PIN hashing + the location/IP capture used by set-pin and verify-pin.
// See M1a-identity-auth.md Task 2.

import bcrypt from "npm:bcryptjs@2";

const BCRYPT_ROUNDS = 10;
export const PIN_LOCKOUT_THRESHOLD = 5;
const PIN_VALIDITY_DAYS = 30;

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return await bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPinHash(pin: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(pin, hash);
}

export function pinExpiresAt(from = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + PIN_VALIDITY_DAYS);
  return d.toISOString();
}

/**
 * No geo-IP lookup service is configured — this captures the raw client IP (from the
 * `x-forwarded-for` header Supabase's edge runtime sets) as an informational string.
 * Purely for a future admin portal (constitution.md §10), never used in an access
 * decision. Swap for a real geo-IP lookup later without a schema change.
 */
export function captureLoginLocation(req: Request): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  return forwardedFor.split(",")[0].trim();
}
