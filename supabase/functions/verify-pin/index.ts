// verify-pin
//
// The repeat-login path: { email, pin, device_id } -> a TallyThreads JWT, shaped
// identically to mint-member-session's, so downstream code can't tell which
// credential path was used. No Authorization header — this IS the auth mechanism.
//
// Gate: a device can only PIN-login after it has previously completed a full Google
// sign-in (mint-member-session enrolled the (device_id, member_id) row). PIN, lockout,
// and expiry are all scoped to that one device+member pair, not member-wide — see
// specs/tasks/M1a-identity-auth.md Task 2, subtask 5.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { mintMemberJwt } from "../_shared/jwt.ts";
import { PIN_LOCKOUT_THRESHOLD, captureLoginLocation, isValidPinFormat, verifyPinHash } from "../_shared/pin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const LOCKED_MESSAGE = "Too many failed attempts. Please sign in with Google to reset your PIN.";
const EXPIRED_MESSAGE = "Your PIN has expired. Please sign in with Google.";
const NOT_ENROLLED_MESSAGE = "Please sign in with Google on this device first.";
const WRONG_PIN_MESSAGE = "Incorrect email or PIN.";

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let email: unknown;
  let pin: unknown;
  let deviceId: unknown;
  try {
    const body = await req.json();
    email = body?.email;
    pin = body?.pin;
    deviceId = body?.device_id;
  } catch {
    // handled below
  }
  if (typeof email !== "string" || !email) {
    return json({ error: "Missing email" }, 400);
  }
  if (!isValidPinFormat(pin)) {
    return json({ error: "PIN must be 4 to 6 digits" }, 400);
  }
  if (typeof deviceId !== "string" || !deviceId) {
    return json({ error: "Missing device_id" }, 400);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing env vars");
    return json({ error: "Function misconfigured (missing env vars)" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id")
    .eq("google_email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (memberError) {
    console.error("member lookup failed:", memberError);
    return json({ error: "Failed to verify PIN", detail: memberError.message }, 500);
  }
  if (!member) {
    // Same message as "wrong PIN" — don't let this endpoint be used to enumerate
    // which emails have signed up.
    return json({ error: WRONG_PIN_MESSAGE }, 401);
  }

  const { data: device, error: deviceError } = await admin
    .from("devices")
    .select("id, pin_hash, pin_expires_at, pin_failed_attempts, revoked_at")
    .eq("device_id", deviceId)
    .eq("member_id", member.id)
    .maybeSingle();

  if (deviceError) {
    console.error("device lookup failed:", deviceError);
    return json({ error: "Failed to verify PIN", detail: deviceError.message }, 500);
  }
  if (!device || device.revoked_at || !device.pin_hash) {
    return json({ error: NOT_ENROLLED_MESSAGE }, 403);
  }

  if (device.pin_failed_attempts >= PIN_LOCKOUT_THRESHOLD) {
    return json({ error: LOCKED_MESSAGE }, 423);
  }

  if (!device.pin_expires_at || new Date(device.pin_expires_at) < new Date()) {
    return json({ error: EXPIRED_MESSAGE }, 403);
  }

  const pinMatches = await verifyPinHash(pin, device.pin_hash);
  const now = new Date().toISOString();
  const location = captureLoginLocation(req);

  if (!pinMatches) {
    const nextAttempts = device.pin_failed_attempts + 1;
    await admin
      .from("devices")
      .update({
        pin_failed_attempts: nextAttempts,
        pin_locked_until: nextAttempts >= PIN_LOCKOUT_THRESHOLD ? now : null,
      })
      .eq("id", device.id);

    return json(
      { error: nextAttempts >= PIN_LOCKOUT_THRESHOLD ? LOCKED_MESSAGE : WRONG_PIN_MESSAGE },
      401,
    );
  }

  const { error: updateError } = await admin
    .from("devices")
    .update({
      pin_failed_attempts: 0,
      pin_locked_until: null,
      last_seen_at: now,
      last_login_location: location,
    })
    .eq("id", device.id);

  if (updateError) {
    console.error("device update after successful PIN failed:", updateError);
    // Non-fatal — the PIN was correct, don't block sign-in over a bookkeeping write.
  }

  const jwt = await mintMemberJwt(member.id);

  const { data: memberProfile } = await admin
    .from("members")
    .select("id, google_id, google_email, email_verified, first_name, last_name, avatar_url, locale")
    .eq("id", member.id)
    .single();

  return json({ jwt, member: memberProfile });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("Unhandled error in verify-pin:", e);
    return json(
      { error: "Unhandled error", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
