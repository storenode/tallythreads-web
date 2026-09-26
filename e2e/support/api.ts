import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { E2EEnv } from "./env";

/**
 * Server-side helpers for seeding and verifying test data, driven by a real member JWT
 * (so RLS applies exactly as it does in the app). Used by fixtures for setup/teardown and
 * by specs to confirm that what the UI did actually reached Supabase.
 */

export interface SessionMember {
  id: string;
  google_id: string | null;
  google_email: string;
  email_verified: boolean;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  locale: string | null;
}

export interface MemberSession {
  jwt: string;
  member: SessionMember;
}

export interface DemoOrg {
  id: string;
  name: string;
  ownerEmail: string;
  ownerMemberId: string;
}

const MEMBER_COLS =
  "id, google_id, google_email, email_verified, first_name, last_name, avatar_url, locale";

export function clientFor(env: E2EEnv, jwt: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.anonKey, {
    accessToken: async () => jwt,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchOwnMember(
  env: E2EEnv,
  jwt: string,
  memberId: string,
): Promise<SessionMember> {
  const { data, error } = await clientFor(env, jwt)
    .from("members")
    .select(MEMBER_COLS)
    .eq("id", memberId)
    .single();
  if (error) throw new Error(`Couldn't read member ${memberId}: ${error.message}`);
  return data as SessionMember;
}

async function callDemoLogin<T>(
  env: E2EEnv,
  bearer: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${env.supabaseUrl}/functions/v1/demo-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.anonKey,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`demo-login ${String(body.action)} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json as T;
}

/** Platform-admin: issue a short-lived demo grant (the token a launch link carries). */
export async function issueDemoGrant(env: E2EEnv, memberId: string): Promise<string> {
  const { token } = await callDemoLogin<{ token: string }>(env, env.adminJwt, {
    action: "issue",
    member_id: memberId,
  });
  return token;
}

/** Public: redeem a grant for a real member session (what /demo/launch does in-browser). */
export async function redeemDemoGrant(env: E2EEnv, token: string): Promise<MemberSession> {
  return callDemoLogin<MemberSession>(env, env.anonKey, { action: "redeem", token });
}

/**
 * Creates an `is_demo` organization through the same RPC the admin console uses, with an
 * org_owner (primary contact) placeholder member. Chain type so it has no store cap.
 */
export async function createDemoOrg(env: E2EEnv, tag: string, label: string): Promise<DemoOrg> {
  const admin = clientFor(env, env.adminJwt);
  const name = `E2E ${label} ${tag}`;
  const ownerEmail = `e2e.owner.${tag}@example.com`;
  const { data, error } = await admin.rpc("provision_organization_with_contacts", {
    org_name: name,
    org_registration_type: "chain",
    org_is_demo: true,
    invites: [{ email: ownerEmail, role_name: "org_owner", is_primary_contact: true }],
  });
  if (error) throw new Error(`provision_organization_with_contacts: ${error.message}`);
  const org = data as { id: string; primary_contact_member_id: string | null };
  if (!org.primary_contact_member_id) {
    throw new Error("Demo org was created without a primary contact member");
  }
  return { id: org.id, name, ownerEmail, ownerMemberId: org.primary_contact_member_id };
}

/** Removes an org and everything under it (the traceless RPC also purges orphaned members). */
export async function hardDeleteOrg(env: E2EEnv, orgId: string): Promise<void> {
  const admin = clientFor(env, env.adminJwt);
  const { error } = await admin.rpc("hard_delete_organization", { org_id: orgId });
  if (error) throw new Error(`hard_delete_organization(${orgId}): ${error.message}`);
}

export interface SeededParcel {
  tripTitle: string;
  supplierName: string;
  invoiceId: string;
}

/**
 * Seeds one COMPLETED trip with a single pending invoice (one 10-piece line item), as the
 * given member — the state a parcel is in when it first appears on the Deliveries page.
 */
export async function seedCompletedTrip(
  env: E2EEnv,
  session: MemberSession,
  orgId: string,
  tag: string,
): Promise<SeededParcel> {
  const db = clientFor(env, session.jwt);
  const tripId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const tripTitle = `E2E delivery trip ${tag}`;
  const supplierName = `E2E Parcel Mills ${tag}`;

  const trip = await db.from("purchase_trips").insert({
    id: tripId,
    organization_id: orgId,
    created_by: session.member.id,
    title: tripTitle,
    status: "completed",
    expected_margin_pct: 0.2,
    started_at: now,
    completed_at: now,
  });
  if (trip.error) throw new Error(`seed purchase_trips: ${trip.error.message}`);

  const invoice = await db.from("purchase_invoices").insert({
    id: invoiceId,
    trip_id: tripId,
    supplier_name: supplierName,
    supplier_invoice_no: `INV-${tag}`,
    invoice_date: now.slice(0, 10),
    margin_config: { type: "flat", pct: 0.2 },
    source: "manual",
    needs_review: false,
  });
  if (invoice.error) throw new Error(`seed purchase_invoices: ${invoice.error.message}`);

  const item = await db.from("purchase_invoice_items").insert({
    id: crypto.randomUUID(),
    invoice_id: invoiceId,
    description: "Cotton saree",
    quantity: 10,
    unit_cost_paise: 100_000,
    is_trending: false,
  });
  if (item.error) throw new Error(`seed purchase_invoice_items: ${item.error.message}`);

  return { tripTitle, supplierName, invoiceId };
}
