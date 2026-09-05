import { Navigate } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { EntityPicker } from "@/components/ui/EntityPicker";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { useMyStores } from "./myStores";

const log = (...args: unknown[]) => console.log("[StorePickerPage]", ...args);

/**
 * Landing page for /ops — mirrors OrgPickerPage at the store level. Resolves the
 * signed-in member's store memberships: exactly one auto-redirects to
 * /ops/:storeId/billing, two or more render a picker (spanning every org the member
 * has store access in, not just one — see myStores.ts), zero falls back to
 * /no-store defensively.
 *
 * Bugfix (2026-09-03): this had the exact gap LaunchPage.tsx did (see that file's
 * "Bugfix (2026-09-03)" note) and OrgPickerPage.tsx already guarded against —
 * `entitlementsLoading` alone reads `false` on the very first render before
 * `member` itself resolves, with `entitlements` still `undefined`, so `storeIds`
 * read as `[]` and this navigated to /no-store before the real count ever loaded.
 * Reported live: selecting Operations from the header AreaSwitcher after visiting
 * Organization/Admin landed on /no-store instead of the one held store. Now
 * guarded the same way OrgPickerPage already was.
 */
export default function StorePickerPage() {
  const { member, isLoading: memberLoading } = useMember();
  const {
    data: entitlements,
    isError: entitlementsError,
  } = useEntitlements(member?.id);
  const storeIds = entitlements?.stores.map((s) => s.storeId) ?? [];
  const { data: stores, isLoading: storesLoading } = useMyStores(storeIds);

  const stillResolvingEntitlements =
    memberLoading || (Boolean(member) && !entitlements && !entitlementsError);

  log("state", {
    memberId: member?.id,
    memberLoading,
    entitlementsError,
    stillResolvingEntitlements,
    hasEntitlements: Boolean(entitlements),
    storeIds,
    storesLoading,
  });

  if (stillResolvingEntitlements || (storeIds.length > 0 && storesLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (storeIds.length === 0) {
    log("no stores -> /no-store");
    return <Navigate to="/no-store" replace />;
  }

  if (storeIds.length === 1) {
    return <Navigate to={`/ops/${storeIds[0]}/billing`} replace />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between p-4">
        <Logo size="sm" />
        <AccountMenu />
      </div>
      <div className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-8">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-fg">Choose a store</h1>
          <p className="text-sm text-fg-muted">
            You're tagged to more than one — pick which one you're working at.
          </p>
        </div>
        <EntityPicker
          items={(stores ?? []).map((s) => ({
            id: s.id,
            title: s.name,
            subtitle: [s.organizationName, s.store_code].filter(Boolean).join(" · "),
            to: `/ops/${s.id}/billing`,
          }))}
        />
      </div>
    </div>
  );
}
