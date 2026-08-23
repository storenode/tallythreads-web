// mint-member-session
//
// Called by the client immediately after supabase.auth.signInWithOAuth({ provider: "google" })
// completes its redirect round-trip. Supabase's OAuth handshake (and its auth.users row) is
// treated as disposable plumbing — this function is what actually establishes StoreParda's
// identity: it reads the Google profile Supabase captured, upserts a `members` row keyed on
// Google's stable `sub` claim, and mints StoreParda's own JWT (sub = members.id) so RLS's
// auth.uid() works against `members`, not `auth.users`.
//
// It also enrolls the calling device: every completed Google sign-in upserts a `devices` row
// for (device_id, member_id), stamping last_seen_at/last_login_location. Per
// M1a-identity-auth.md, every Google sign-in — first-ever or repeat — forces the client to
// (re)set that device's PIN next, so this function never returns an existing PIN's state.
//
// See specs/tasks/M1-auth-google.md and specs/tasks/M1a-identity-auth.md for the full design.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { mintMemberJwt } from "../_shared/jwt.ts";
import { captureLoginLocation } from "../_shared/pin.ts";

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
  const callerToken = authHeader.slice("Bearer ".length);

  let deviceId: string | undefined;
  try {
    const body = await req.json();
    deviceId = typeof body?.device_id === "string" ? body.device_id : undefined;
  } catch {
    // No/invalid JSON body — deviceId stays undefined, handled below.
  }
  if (!deviceId) {
    return json({ error: "Missing device_id" }, 400);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing env vars:", {
      hasUrl: Boolean(SUPABASE_URL),
      hasServiceRole: Boolean(SERVICE_ROLE_KEY),
    });
    return json({ error: "Function misconfigured (missing env vars)" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Resolve the caller's Supabase-managed OAuth session to a Google identity.
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(callerToken);

  if (userError || !user) {
    console.error("getUser failed:", userError);
    return json({ error: `Invalid or expired session: ${userError?.message ?? "no user"}` }, 401);
  }

  const googleIdentity = user.identities?.find((i) => i.provider === "google");
  if (!googleIdentity) {
    return json({ error: "No Google identity on this session" }, 400);
  }

  const claims = googleIdentity.identity_data ?? {};
  const googleId = String(claims.sub ?? googleIdentity.id);
  const googleEmail = String(claims.email ?? user.email ?? "");

  if (!googleId || !googleEmail) {
    return json({ error: "Google identity payload missing sub/email" }, 400);
  }

  const profile = {
    google_id: googleId,
    google_email: googleEmail,
    email_verified: Boolean(claims.email_verified ?? false),
    first_name: (claims.given_name as string | undefined) ?? null,
    last_name: (claims.family_name as string | undefined) ?? null,
    avatar_url: (claims.picture as string | undefined) ?? null,
    locale: (claims.locale as string | undefined) ?? null,
    last_modified_at: new Date().toISOString(),
  };

  // Upsert keyed on google_id — the stable identifier, not the mutable email.
  const { data: member, error: upsertError } = await admin
    .from("members")
    .upsert(profile, { onConflict: "google_id" })
    .select("id, google_id, google_email, email_verified, first_name, last_name, avatar_url, locale")
    .single();

  if (upsertError || !member) {
    console.error("members upsert failed:", upsertError);
    return json(
      {
        error: "Failed to persist member",
        detail: upsertError?.message,
        code: upsertError?.code,
        hint: upsertError?.hint,
      },
      500,
    );
  }

  // Enroll this (device_id, member_id) pair. Composite-unique, so a shared physical
  // device can carry independent enrollments for multiple members — see
  // M1a-identity-auth.md's shared-devices note.
  const now = new Date().toISOString();
  const location = captureLoginLocation(req);
  const { error: deviceError } = await admin
    .from("devices")
    .upsert(
      {
        device_id: deviceId,
        member_id: member.id,
        last_seen_at: now,
        last_login_location: location,
      },
      { onConflict: "device_id,member_id", ignoreDuplicates: false },
    );

  if (deviceError) {
    console.error("devices upsert failed:", deviceError);
    return json(
      { error: "Failed to enroll device", detail: deviceError.message, code: deviceError.code },
      500,
    );
  }

  // Mint StoreParda's own JWT: sub = members.id, not the auth.users id. RLS's auth.uid()
  // reads this sub claim regardless of whether that id exists in auth.users.
  const jwt = await mintMemberJwt(member.id);

  return json({ jwt, member });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("Unhandled error in mint-member-session:", e);
    return json(
      { error: "Unhandled error", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
