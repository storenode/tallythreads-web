// set-pin
//
// Called right after mint-member-session, on every Google sign-in (first-ever or
// repeat) — M1a-identity-auth.md requires a device's PIN to be (re)created every time
// its member completes Google sign-in on it, never carried over from a prior device
// or a prior enrollment. Authenticated with the caller's just-minted StoreParda JWT
// (not a Supabase auth.users session — mint-member-session already happened).
//
// See specs/tasks/M1a-identity-auth.md Task 2, subtask 4.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyMemberJwt } from "../_shared/jwt.ts";
import { hashPin, isValidPinFormat, pinExpiresAt } from "../_shared/pin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }

  let memberId: string;
  try {
    memberId = await verifyMemberJwt(authHeader.slice("Bearer ".length));
  } catch (e) {
    return json({ error: `Invalid or expired session: ${e instanceof Error ? e.message : e}` }, 401);
  }

  let deviceId: string | undefined;
  let pin: unknown;
  try {
    const body = await req.json();
    deviceId = typeof body?.device_id === "string" ? body.device_id : undefined;
    pin = body?.pin;
  } catch {
    // handled below
  }
  if (!deviceId) {
    return json({ error: "Missing device_id" }, 400);
  }
  if (!isValidPinFormat(pin)) {
    return json({ error: "PIN must be 4 to 6 digits" }, 400);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing env vars");
    return json({ error: "Function misconfigured (missing env vars)" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const pinHash = await hashPin(pin);
  const now = new Date().toISOString();

  // The (device_id, member_id) row must already exist — created by mint-member-session
  // during this same Google sign-in. If it doesn't, this device was never enrolled by
  // this member; set-pin is not itself an enrollment path.
  const { data: device, error: updateError } = await admin
    .from("devices")
    .update({
      pin_hash: pinHash,
      pin_created_at: now,
      pin_expires_at: pinExpiresAt(),
      pin_failed_attempts: 0,
      pin_locked_until: null,
    })
    .eq("device_id", deviceId)
    .eq("member_id", memberId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("set-pin update failed:", updateError);
    return json({ error: "Failed to set PIN", detail: updateError.message }, 500);
  }
  if (!device) {
    return json(
      { error: "Device is not enrolled for this member — sign in with Google on this device first" },
      404,
    );
  }

  return json({ ok: true });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("Unhandled error in set-pin:", e);
    return json(
      { error: "Unhandled error", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
