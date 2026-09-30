// demo-login
//
// Lets a platform admin hand out a one-click "launch as this member" link, so a prospect,
// the founder or an automated QA agent (e.g. Claude) can open the app AS an organization's
// member without Google OAuth + PIN. Used from /admin/demo (demo orgs) and, since
// 2026-09-29 at the founder's request, from /admin/organizations for ANY organization —
// same behaviour, no extra checks; the org's is_demo flag is not touched.
//
// Two actions on one endpoint (verify_jwt = false — see config.toml):
//   - "issue"  (platform-admin only): returns a short-lived *grant* token for a member of
//              any organization. Authenticated with the admin's own TallyThreads JWT.
//   - "redeem" (public): exchanges a valid grant token for a real member session JWT.
//
// Security: the grant token is signed with APP_JWT_SECRET but carries
// purpose:"demo-grant" and deliberately NO role/aud — so PostgREST/RLS reject it as an
// API credential; only this function's redeem step honors it. The real 30-day member
// JWT is produced only at redeem time (in the opener's browser), never placed in a URL.
// Both issue and redeem require the target to hold an active membership in a live
// organization (directly or via one of its stores) — any org, demo or not.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, jwtVerify } from "npm:jose@5";
import { corsHeaders, json } from "../_shared/cors.ts";
import { getJwtSecretKey, mintMemberJwt, verifyMemberJwt } from "../_shared/jwt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GRANT_PURPOSE = "demo-grant";
const GRANT_TTL_SECONDS = 60 * 30; // 30 minutes — enough for a QA session, short enough to limit reuse.

const MEMBER_COLS =
  "id, google_id, google_email, email_verified, first_name, last_name, avatar_url, locale";

/** Grant token: NOT an API credential — no role/aud, distinct purpose claim. */
async function mintDemoGrant(memberId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ purpose: GRANT_PURPOSE })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(memberId)
    .setIssuedAt(now)
    .setExpirationTime(now + GRANT_TTL_SECONDS)
    .sign(getJwtSecretKey());
}

async function verifyDemoGrant(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getJwtSecretKey());
  if (payload.purpose !== GRANT_PURPOSE) throw new Error("Not a demo-grant token");
  if (!payload.sub) throw new Error("Token has no subject");
  return payload.sub;
}

/**
 * The member's non-deleted memberships that resolve to a live (non-deleted) organization —
 * a direct org membership or a store-scoped one (via the store's parent org). Platform-level
 * memberships (e.g. platform_admin) resolve to no organization, so a platform admin can't be
 * launched as. Returns whether any exists, and whether any of those orgs is a demo org.
 */
async function orgMembership(
  admin: SupabaseClient,
  memberId: string,
): Promise<{ member: boolean; demo: boolean }> {
  const { data, error } = await admin
    .from("memberships")
    .select(
      "organizations(is_demo, deleted_at), stores(deleted_at, organizations(is_demo, deleted_at))",
    )
    .eq("member_id", memberId)
    .is("deleted_at", null);
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  const orgs = (data ?? []).flatMap((row: any) => {
    const direct = row.organizations && !row.organizations.deleted_at ? [row.organizations] : [];
    const viaStore =
      row.stores && !row.stores.deleted_at && row.stores.organizations && !row.stores.organizations.deleted_at
        ? [row.stores.organizations]
        : [];
    return [...direct, ...viaStore];
  });
  // deno-lint-ignore no-explicit-any
  return { member: orgs.length > 0, demo: orgs.some((o: any) => o.is_demo === true) };
}

async function handleIssue(admin: SupabaseClient, req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }
  let callerId: string;
  try {
    callerId = await verifyMemberJwt(authHeader.slice("Bearer ".length));
  } catch (e) {
    return json({ error: `Invalid or expired session: ${e instanceof Error ? e.message : e}` }, 401);
  }

  // Platform admin is modeled as a membership with the platform-scoped
  // "platform_admin" role (there is no members.platform_role column).
  const { data: adminMembership, error: callerError } = await admin
    .from("memberships")
    .select("id, roles!inner(name, scope_type)")
    .eq("member_id", callerId)
    .eq("roles.name", "platform_admin")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (callerError) {
    console.error("caller lookup failed:", callerError);
    return json({ error: "Failed to authorize", detail: callerError.message }, 500);
  }
  if (!adminMembership) {
    return json({ error: "Only a platform admin can issue launch links" }, 403);
  }

  let memberId: string | undefined;
  try {
    const body = await req.json();
    memberId = typeof body?.member_id === "string" ? body.member_id : undefined;
  } catch {
    // handled below
  }
  if (!memberId) return json({ error: "Missing member_id" }, 400);

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id")
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (memberError) {
    console.error("member lookup failed:", memberError);
    return json({ error: "Failed to load member", detail: memberError.message }, 500);
  }
  if (!member) return json({ error: "Member not found" }, 404);

  if (!(await orgMembership(admin, memberId)).member) {
    return json({ error: "Member is not part of an organization" }, 403);
  }

  const token = await mintDemoGrant(memberId);
  const expiresAt = new Date(Date.now() + GRANT_TTL_SECONDS * 1000).toISOString();
  return json({ token, expires_at: expiresAt });
}

async function handleRedeem(admin: SupabaseClient, req: Request): Promise<Response> {
  let token: string | undefined;
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : undefined;
  } catch {
    // handled below
  }
  if (!token) return json({ error: "Missing token" }, 400);

  let memberId: string;
  try {
    memberId = await verifyDemoGrant(token);
  } catch {
    return json({ error: "This launch link is invalid or has expired." }, 401);
  }

  const { data: member, error: memberError } = await admin
    .from("members")
    .select(MEMBER_COLS)
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (memberError) {
    console.error("member lookup failed:", memberError);
    return json({ error: "Failed to load member", detail: memberError.message }, 500);
  }
  if (!member) return json({ error: "This launch link is invalid or has expired." }, 401);

  // Re-check at redeem time — the member may have been removed (or the org deleted) since
  // the link was issued.
  const membership = await orgMembership(admin, memberId);
  if (!membership.member) {
    return json({ error: "This member is no longer part of an organization." }, 403);
  }

  // Mirror mint-member-session: a placeholder DEMO member is inactive until first use.
  // Real orgs are left alone — an invited person who hasn't signed in yet stays "invited".
  // Best-effort — don't block sign-in on this bookkeeping write.
  if (membership.demo) {
    const { error: activateError } = await admin
      .from("members")
      .update({ is_active: true })
      .eq("id", memberId);
    if (activateError) console.error("is_active update failed (non-fatal):", activateError);
  }

  const jwt = await mintMemberJwt(member.id);
  return json({ jwt, member });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing env vars");
    return json({ error: "Function misconfigured (missing env vars)" }, 500);
  }

  // Peek at the action without consuming the body the handlers need to re-read: clone.
  let action: string | undefined;
  try {
    const body = await req.clone().json();
    action = typeof body?.action === "string" ? body.action : undefined;
  } catch {
    // handled below
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (action === "issue") return await handleIssue(admin, req);
  if (action === "redeem") return await handleRedeem(admin, req);
  return json({ error: "Unknown or missing action (expected 'issue' or 'redeem')" }, 400);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("Unhandled error in demo-login:", e);
    return json(
      { error: "Unhandled error", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
