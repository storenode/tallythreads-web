import { Navigate } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { getAccessibleAreas } from "@/features/auth/getAccessibleAreas";
import { useMyOrganizations } from "@/features/stores/myOrganizations";
import { useMyStores } from "@/features/operations/myStores";
import { roleDisplayName } from "@/features/admin/roles/roles";
import { LaunchAreaTree, type LaunchRow } from "./LaunchAreaTree";

const log = (...args: unknown[]) => console.log("[LaunchPage]", ...args);

/**
 * Landing page for a member with access to more than one top-level area (Admin
 * console / Organization / Store Operations) — resolvePostSignInPath sends anyone
 * with >1 accessible area here instead of silently picking one for them.
 *
 * Bugfix this closes (2026-08-31, later): resolvePostSignInPath used to have its own
 * fixed priority order — platform_admin always won outright, even for a member who
 * was *also* an org_owner/org_manager on real organizations and a store_manager on a
 * store. That member got routed straight to /admin every time, with no way to see
 * their other access short of the header AreaSwitcher (easy to miss on first login).
 * Confirmed live for exactly that combination via the entitlements payload.
 *
 * Redesigned (2026-09-02) from a flat area-only EntityPicker card list to a TanStack
 * Table tree grid (LaunchAreaTree.tsx): Admin / Organization / Operations at the
 * root, with every distinct organization or store the member actually holds a role
 * on as an expandable child. The old version's subtitle just counted
 * entitlements.organizations.length — a raw membership-row count, not a
 * distinct-organization count — so a member holding three roles on one organization
 * (org_owner + org_manager + org_accountant, confirmed live) read as
 * "3 organizations" even though it's one. This dedupes by organizationId/storeId
 * and rolls every held role into that org/store row's own Role/Permissions/Details
 * columns instead. Rows default to fully expanded so that context is visible
 * without an extra click.
 *
 * Flattened, take one (2026-09-03): each role used to also get its own child row
 * nested one level under its organization/store (Owner / Operations Manager /
 * Accountant as three separate rows under "Bandrip Demo", say). Feedback, and
 * correctly: those rows had nowhere to go — clicking one led to the exact same
 * place as its parent org/store — and the parent row already listed every role
 * name and the combined permission count. They added a third tree level with no
 * navigational purpose on a screen whose only job is "pick where to go." Removed;
 * a role's info now lives entirely in its org/store row's own columns.
 *
 * Flattened, take two (2026-09-03): the Admin/Organization/Operations grouping
 * rows went the same way, on the same feedback and for the same reason — "Organization"
 * and "Operations" weren't destinations either, just headers with a count, and
 * expanding/collapsing them was one more click before reaching an actual row. This
 * is now one flat list, no grouping, no expand/collapse anywhere: Admin (if
 * platform_admin) first, then every distinct organization the member holds a role
 * on, then every distinct store — in that order, each one a leaf with its own
 * destination. LaunchAreaTree.tsx (kept as the filename despite no longer being a
 * tree, to avoid leaving an orphaned file behind) renders it as a plain table.
 *
 * Store-under-organization relation (2026-09-03): flattening the list (above) lost
 * something real — a store belongs to exactly one organization, and with orgs and
 * stores in two separate blocks that relation wasn't visible anywhere (a store's
 * org name was buried at the end of its Details cell, easy to miss). Fixed two
 * ways at once: each store row is now placed immediately after its own
 * organization's row instead of in a separate trailing block (so "Bandrip Nellore"
 * sits right under "Bandrip Demo"), and the store's Name cell carries a small
 * "in <organization name>" line plus a slight indent, via LaunchRow.parentLabel —
 * still no expand/collapse, just a visual cue. A store whose organization isn't in
 * the member's own organization list (the billing/inventory-permission cascade in
 * entitlements.ts can grant store access without a matching org row) falls back to
 * the end of the list, still labeled with its org name from useMyStores.
 *
 * Bugfix (2026-09-03): this was redirecting straight to /no-store immediately
 * after a fresh sign-in, even with a fully populated entitlements payload (3
 * accessible areas) sitting right there in the primed React Query cache —
 * confirmed live. Root cause: on the very first render, useMember()'s Dexie live
 * query hasn't resolved yet, so `member` is `undefined`; useEntitlements(undefined)
 * is `enabled: false`, and TanStack Query v5 defines `isLoading` as `isPending &&
 * isFetching` — a disabled query is never fetching, so it reports `isLoading:
 * false` despite having no data at all. This component's own `isLoading` gate only
 * ever looked at `entitlementsLoading`, so it fell straight through that first
 * render with `entitlements` still `undefined`, and getAccessibleAreas(undefined)
 * returns `[]` — read as "this member has zero access" instead of "still
 * resolving," and it navigated to /no-store before useMember() ever got a chance
 * to populate. RequireArea.tsx already had the fix for exactly this gap (see its
 * own comment) — this now uses the same guard: wait for `memberLoading`, and for
 * the "member exists but entitlements hasn't resolved yet" window in between.
 *
 * Kept as its own function (rather than inlining the paths at each call site —
 * LoginPage.tsx and SetPinPage.tsx both call this) so there's one place to change
 * routing as more destinations are built.
 */
export default function LaunchPage() {
  const { member, isLoading: memberLoading } = useMember();
  const {
    data: entitlements,
    isLoading: entitlementsLoading,
    isError: entitlementsError,
  } = useEntitlements(member?.id);

  const orgIds = [
    ...new Set(entitlements?.organizations.map((o) => o.organizationId) ?? []),
  ];
  const storeIds = [...new Set(entitlements?.stores.map((s) => s.storeId) ?? [])];
  const { data: orgs, isLoading: orgsLoading } = useMyOrganizations(orgIds);
  const { data: stores, isLoading: storesLoading } = useMyStores(storeIds);

  // Mirrors RequireArea.tsx's guard: `entitlementsLoading` alone can read `false`
  // while `member` (and so the entitlements query itself) hasn't resolved yet —
  // see the bugfix note above. Don't trust "areas.length === 0" until both of
  // those have actually settled.
  const stillResolvingEntitlements =
    memberLoading || (Boolean(member) && !entitlements && !entitlementsError);

  const isLoading =
    stillResolvingEntitlements ||
    (orgIds.length > 0 && orgsLoading) ||
    (storeIds.length > 0 && storesLoading);

  log("state", {
    memberId: member?.id,
    memberLoading,
    entitlementsLoading,
    entitlementsError,
    stillResolvingEntitlements,
    hasEntitlements: Boolean(entitlements),
    orgIds,
    storeIds,
    isLoading,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  const areas = getAccessibleAreas(entitlements);
  log("resolved areas", areas.map((a) => a.key));

  if (areas.length === 0) {
    log("no accessible areas -> /no-store");
    return <Navigate to="/no-store" replace />;
  }

  if (areas.length === 1) {
    log("exactly one accessible area -> auto-redirecting to", areas[0].to);
    return <Navigate to={areas[0].to} replace />;
  }

  const rows: LaunchRow[] = [];

  if (entitlements?.platformRole === "platform_admin") {
    rows.push({
      id: "admin",
      name: "Admin",
      to: "/admin",
      scope: "Admin",
      role: roleDisplayName("platform_admin"),
      detail: "Full platform administration — every organization and store",
    });
  }

  if (entitlements) {
    const byOrg = new Map<string, typeof entitlements.organizations>();
    for (const o of entitlements.organizations) {
      byOrg.set(o.organizationId, [...(byOrg.get(o.organizationId) ?? []), o]);
    }

    const storeRolesById = new Map<string, typeof entitlements.stores>();
    for (const s of entitlements.stores) {
      storeRolesById.set(s.storeId, [...(storeRolesById.get(s.storeId) ?? []), s]);
    }
    const storeIdsByOrg = new Map<string, string[]>();
    for (const [storeId, roles] of storeRolesById) {
      const orgId = roles[0].organizationId;
      if (!orgId) continue;
      storeIdsByOrg.set(orgId, [...(storeIdsByOrg.get(orgId) ?? []), storeId]);
    }

    const buildStoreRow = (
      storeId: string,
      roles: typeof entitlements.stores,
      parentLabel: string | undefined,
    ): LaunchRow => {
      const store = stores?.find((s) => s.id === storeId);
      const permissionCount = new Set(roles.flatMap((r) => r.permissions)).size;
      return {
        id: `store-${storeId}`,
        name: store?.name ?? storeId,
        to: `/ops/${storeId}/billing`,
        scope: "Store",
        role: roles.map((r) => roleDisplayName(r.role)).join(", "),
        permissionCount,
        detail: store?.store_code ?? undefined,
        parentLabel: parentLabel ?? store?.organizationName,
      };
    };

    const emittedStoreIds = new Set<string>();

    for (const [orgId, roles] of byOrg) {
      const org = orgs?.find((o) => o.id === orgId);
      const permissionCount = new Set(roles.flatMap((r) => r.permissions)).size;
      rows.push({
        id: `org-${orgId}`,
        name: org?.name ?? orgId,
        to: `/org/${orgId}/stores`,
        scope: "Organization",
        role: roles.map((r) => roleDisplayName(r.role)).join(", "),
        permissionCount,
        detail: `${roles.length} role${roles.length === 1 ? "" : "s"} held here`,
      });

      for (const storeId of storeIdsByOrg.get(orgId) ?? []) {
        rows.push(buildStoreRow(storeId, storeRolesById.get(storeId)!, org?.name ?? orgId));
        emittedStoreIds.add(storeId);
      }
    }

    // Defensive: a store granted via the org-permission cascade (entitlements.ts)
    // whose organization isn't itself in this member's organization list. Shouldn't
    // happen in practice — the cascade only ever adds stores for orgs already in
    // `entitlements.organizations` — but falls back to the end of the list rather
    // than silently dropping the store if it ever does.
    for (const [storeId, roles] of storeRolesById) {
      if (emittedStoreIds.has(storeId)) continue;
      rows.push(buildStoreRow(storeId, roles, undefined));
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between p-4">
        <Logo size="sm" />
        <AccountMenu />
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8">
        <div>
          <h1 className="text-lg font-semibold text-fg">Where would you like to go?</h1>
          <p className="text-sm text-fg-muted">
            You have access to more than one area — every organization and store you
            hold a role on is listed below. Click a name to open it. You can switch
            anytime from the header.
          </p>
        </div>
        <LaunchAreaTree data={rows} />
      </div>
    </div>
  );
}
