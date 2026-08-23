// get-entitlements
//
// Returns the caller's own memberships row set plus the small roles/permissions/
// role_permissions/stores reference tables, so the client can resolve them through
// src/lib/entitlements.ts's resolveEntitlements(). Exists because this Supabase
// project has no legacy JWT secret configured — PostgREST only trusts its own
// asymmetric signing keys, so a StoreParda-minted JWT (see _shared/jwt.ts) can never
// authenticate a direct supabase-js REST call. Every read of member-scoped data has
// to go through an Edge Function like this one instead, which verifies the JWT itself
// (verifyMemberJwt, plain HS256 — doesn't touch PostgREST/RLS at all) and then reads
// with the service-role key. See M1b-Core-Tenancy-Schema.md §4.
//
// This function does NOT itself decide what the caller is allowed to do — it only
// returns their own rows. Authorization for any actual mutation still has to happen
// in that mutating function, via hasPermission, per M1b §4's "never the authorization
// boundary itself" note.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { verifyMemberJwt } from "../_shared/jwt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing env vars");
    return json({ error: "Function misconfigured (missing env vars)" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const [membershipsRes, rolesRes, permissionsRes, rolePermissionsRes, storesRes] =
    await Promise.all([
      admin
        .from("memberships")
        .select("id, member_id, role_id, organization_id, store_id, deleted_at")
        .eq("member_id", memberId),
      admin.from("roles").select("id, name, scope_type"),
      admin.from("permissions").select("id, key"),
      admin.from("role_permissions").select("role_id, permission_id"),
      admin.from("stores").select("id, organization_id"),
    ]);

  const errors = {
    memberships: membershipsRes.error,
    roles: rolesRes.error,
    permissions: permissionsRes.error,
    role_permissions: rolePermissionsRes.error,
    stores: storesRes.error,
  };
  const hasError = Object.values(errors).some((e) => e !== null);
  if (hasError) {
    console.error("get-entitlements: query failed:", errors);
    return json({ error: "Failed to load entitlements", detail: errors }, 500);
  }

  return json({
    memberships: membershipsRes.data ?? [],
    roles: rolesRes.data ?? [],
    permissions: permissionsRes.data ?? [],
    rolePermissions: rolePermissionsRes.data ?? [],
    stores: storesRes.data ?? [],
  });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("Unhandled error in get-entitlements:", e);
    return json(
      { error: "Unhandled error", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
