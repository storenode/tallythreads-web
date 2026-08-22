// Shared StoreParda JWT minting/verification for mint-member-session, set-pin, and
// verify-pin. sub = members.id (never auth.users) — see M1-auth-google.md /
// M1a-identity-auth.md for why. 30-day expiry matches the PIN validity window
// (M1a-identity-auth.md Task 1 subtask 4), so a member's session and any given
// device's PIN lapse on the same cadence.

import { SignJWT, jwtVerify } from "npm:jose@5";

const JWT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function getJwtSecretKey(): Uint8Array {
  // Not SUPABASE_JWT_SECRET — the SUPABASE_ prefix is reserved for the platform's own
  // auto-injected vars and `supabase secrets set` refuses to accept it.
  const secret = Deno.env.get("APP_JWT_SECRET");
  if (!secret) throw new Error("Missing APP_JWT_SECRET env var");
  return new TextEncoder().encode(secret);
}

export async function mintMemberJwt(memberId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    role: "authenticated",
    aud: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(memberId)
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(getJwtSecretKey());
}

/** Verifies a StoreParda-minted JWT (not a Supabase auth.users session) and returns members.id. */
export async function verifyMemberJwt(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getJwtSecretKey());
  if (!payload.sub) throw new Error("Token has no subject");
  return payload.sub;
}
