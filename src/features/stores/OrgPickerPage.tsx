import { Navigate } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { EntityPicker } from "@/components/ui/EntityPicker";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { useMyOrganizations } from "./myOrganizations";

/**
 * Landing page for /org — resolves the signed-in member's org memberships: exactly
 * one auto-redirects straight to /org/:orgId/stores, two or more render a picker,
 * zero falls back to /no-store (defensive — RequireArea area="org" shouldn't route
 * here with zero orgs, but this doesn't assume that invariant holds).
 */
export default function OrgPickerPage() {
  const { member, isLoading: memberLoading } = useMember();
  const { data: entitlements, isError } = useEntitlements(member?.id);
  const orgIds = entitlements?.organizations.map((o) => o.organizationId) ?? [];
  const { data: orgs, isLoading: orgsLoading } = useMyOrganizations(orgIds);

  // Same rule as RequireArea: wait for entitlements to actually resolve before
  // deciding "zero orgs" — a premature read here redirects to /no-store and loops.
  if (
    memberLoading ||
    (member && !entitlements && !isError) ||
    (orgIds.length > 0 && orgsLoading)
  ) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (orgIds.length === 0) {
    return <Navigate to="/no-store" replace />;
  }

  if (orgIds.length === 1) {
    return <Navigate to={`/org/${orgIds[0]}/stores`} replace />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between p-4">
        <Logo size="sm" />
        <AccountMenu />
      </div>
      <div className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-8">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-fg">
            Choose an organization
          </h1>
          <p className="text-sm text-fg-muted">
            You're a member of more than one — pick which one to open.
          </p>
        </div>
        <EntityPicker
          items={(orgs ?? []).map((o) => ({
            id: o.id,
            title: o.name,
            to: `/org/${o.id}/stores`,
          }))}
        />
      </div>
    </div>
  );
}
