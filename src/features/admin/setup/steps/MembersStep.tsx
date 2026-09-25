import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, Users, Store as StoreIcon, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Tabs, type TabItem } from "@/components/ui/tabs/Tabs";
import { MemberForm } from "@/components/forms/member/MemberForm";
import { emptyMemberProfileFields } from "@/components/forms/member/types";
import { roleDisplayName } from "@/features/admin/roles/roles";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements, hasPermission } from "@/features/auth/entitlements";
import { useStoresByOrg, useStoreManagerCoverage } from "@/features/stores/stores";
import {
  useStoreMembers,
  useStoreMemberDetail,
  useRevokeStoreMember,
  useInviteStoreMember,
} from "@/features/stores/storesAdmin";
import {
  useOrganizationMembers,
  useOrgMemberDetail,
  useRevokeOrganizationMember,
  type OrganizationFullDetail,
} from "../../organizations/organizations";
import { useSetupOrg } from "../SetupWizardLayout";
import { SetupStepFooter } from "./SetupStepFooter";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface MemberRow {
  membershipId: string;
  memberId: string;
  roleName: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
}

/** Members list — rows are clickable to edit; role/status pills, primary star, revoke. */
function MembersList({
  members,
  isLoading,
  isError,
  emptyText,
  canManage,
  primaryContactMemberId,
  onEdit,
  onRevoke,
  revoking,
}: {
  members: MemberRow[];
  isLoading: boolean;
  isError: boolean;
  emptyText: string;
  canManage: boolean;
  primaryContactMemberId?: string | null;
  onEdit: (memberId: string) => void;
  onRevoke: (membershipId: string) => void;
  revoking: boolean;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isLoading)
    return <p className="text-sm text-fg-muted">Loading members…</p>;
  if (isError)
    return <p className="text-sm text-red-500">Couldn&apos;t load members.</p>;
  if (members.length === 0)
    return <p className="text-sm text-fg-muted">{emptyText}</p>;

  return (
    <div className="space-y-2">
      {members.map((m) => {
        const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
        const isPrimary =
          !!primaryContactMemberId && m.memberId === primaryContactMemberId;
        return (
          <div
            key={m.membershipId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
          >
            <button
              type="button"
              onClick={() => onEdit(m.memberId)}
              className="group min-w-0 flex-1 text-left"
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-fg group-hover:text-tt-green-600">
                {name || m.email}
                {isPrimary && (
                  <Star
                    size={12}
                    className="fill-amber-400 text-amber-400"
                    aria-label="Primary contact"
                  />
                )}
              </p>
              <p className="truncate text-xs text-fg-muted">{m.email}</p>
            </button>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg-muted">
                {roleDisplayName(m.roleName)}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                  m.isActive
                    ? "border-border text-fg-muted"
                    : "border-tt-lavender-500/40 text-tt-lavender-600"
                }`}
              >
                {m.isActive ? "Active" : "Invited"}
              </span>
              {canManage &&
                (confirmId === m.membershipId ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="!bg-red-500 hover:enabled:!bg-red-600"
                      onClick={() => onRevoke(m.membershipId)}
                      disabled={revoking}
                    >
                      {revoking ? "Removing…" : "Confirm"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="border-red-500/50 !text-red-500 hover:enabled:!bg-red-500/10"
                    onClick={() => setConfirmId(m.membershipId)}
                  >
                    <Trash2 size={14} />
                  </Button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Back link shared by the add/edit takeover views. */
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-fg-muted hover:text-fg"
    >
      ← Back to members
    </button>
  );
}

/** Edit takeover for an org member — fetches the profile, then reuses MemberForm. */
function OrgMemberEditForm({
  orgId,
  memberId,
  isPrimaryContact,
  onDone,
}: {
  orgId: string;
  memberId: string;
  isPrimaryContact: boolean;
  onDone: () => void;
}) {
  const { data: detail, isLoading, isError } = useOrgMemberDetail(orgId, memberId);
  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  if (isError || !detail)
    return <p className="text-sm text-red-500">Couldn&apos;t load this member.</p>;
  return (
    <MemberForm
      organizationId={orgId}
      edit={{
        memberId,
        email: detail.email,
        roleName: detail.roleName,
        initialValues: detail,
        isPrimaryContact,
      }}
      onSuccess={onDone}
      onCancel={onDone}
    />
  );
}

/** Edit takeover for a store member. */
function StoreMemberEditForm({
  orgId,
  storeId,
  memberId,
  onDone,
}: {
  orgId: string;
  storeId: string;
  memberId: string;
  onDone: () => void;
}) {
  const { data: detail, isLoading, isError } = useStoreMemberDetail(storeId, memberId);
  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  if (isError || !detail)
    return <p className="text-sm text-red-500">Couldn&apos;t load this member.</p>;
  return (
    <MemberForm
      organizationId={orgId}
      storeId={storeId}
      edit={{
        memberId,
        email: detail.email,
        roleName: detail.roleName,
        initialValues: detail,
      }}
      onSuccess={onDone}
      onCancel={onDone}
    />
  );
}

/** Accordion row for the organization's own members. */
function OrgMembersRow({
  org,
  canManage,
  onAdd,
  onEdit,
}: {
  org: OrganizationFullDetail;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (memberId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { data, isLoading, isError } = useOrganizationMembers(org.id);
  const revoke = useRevokeOrganizationMember(org.id);

  const members = (data ?? []).filter((m) => !m.roleName.startsWith("store_"));
  const hasPrimary = org.primary_contact_member_id != null;

  return (
    <div className="rounded-lg border border-border bg-bg-elevated">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-fg-muted transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 truncate font-medium text-fg group-hover:text-tt-green-600">
          {org.name}
        </span>
        <span className="shrink-0 text-xs text-fg-muted">
          {members.length} member{members.length === 1 ? "" : "s"}
        </span>
        {!hasPrimary && (
          <span className="shrink-0 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning-text">
            No primary contact
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border p-3">
          <MembersList
            members={members}
            isLoading={isLoading}
            isError={isError}
            emptyText="No organization members yet — add the owner (primary contact)."
            canManage={canManage}
            primaryContactMemberId={org.primary_contact_member_id}
            onEdit={onEdit}
            onRevoke={(id) => revoke.mutate(id)}
            revoking={revoke.isPending}
          />
          {canManage && (
            <Button type="button" size="sm" onClick={onAdd}>
              Add member
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Accordion row for one store's members. */
function StoreMembersRow({
  storeId,
  storeName,
  storeCode,
  hasManager,
  ownerEmail,
  canManage,
  onAdd,
  onEdit,
}: {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  hasManager: boolean;
  ownerEmail: string | null;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (memberId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [assignError, setAssignError] = useState<string | null>(null);
  const { data, isLoading, isError } = useStoreMembers(storeId);
  const revoke = useRevokeStoreMember(storeId);
  const invite = useInviteStoreMember(storeId);

  const members = data ?? [];

  const assignOwner = async () => {
    if (!ownerEmail) return;
    setAssignError(null);
    try {
      await invite.mutateAsync({
        email: ownerEmail,
        role_name: "store_manager",
        ...emptyMemberProfileFields,
      });
    } catch (err) {
      setAssignError(errorMessage(err, "Couldn't assign the owner as manager."));
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-fg-muted transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 truncate font-medium text-fg group-hover:text-tt-green-600">
          {storeName}
        </span>
        {storeCode && (
          <span className="shrink-0 text-xs text-fg-muted">{storeCode}</span>
        )}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            hasManager
              ? "bg-success-bg text-success-text"
              : "bg-warning-bg text-warning-text"
          }`}
        >
          {hasManager ? "Owner set" : "No owner yet"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border p-3">
          <MembersList
            members={members}
            isLoading={isLoading}
            isError={isError}
            emptyText="No members for this store yet — add its owner (Manager)."
            canManage={canManage}
            onEdit={onEdit}
            onRevoke={(id) => revoke.mutate(id)}
            revoking={revoke.isPending}
          />

          {canManage && !hasManager && ownerEmail && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="flex-1 text-sm text-fg-muted">
                Single-owner shop? Make the org owner ({ownerEmail}) this
                store&apos;s manager.
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={assignOwner}
                disabled={invite.isPending}
              >
                {invite.isPending ? "Assigning…" : "Owner manages this store"}
              </Button>
            </div>
          )}
          {assignError && <p className="text-sm text-red-500">{assignError}</p>}

          {canManage && (
            <Button type="button" size="sm" onClick={onAdd}>
              Add member
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

type View =
  | { kind: "list" }
  | { kind: "org-add" }
  | { kind: "org-edit"; memberId: string }
  | { kind: "store-add"; storeId: string }
  | { kind: "store-edit"; storeId: string; memberId: string };

/**
 * Wizard step 4 — Members, in two tabs (mirrors Stock setup). Adding or editing
 * a member takes over the whole tab (the list is hidden and replaced by the
 * form with a back link + the form's own Cancel/Save), then returns to the list.
 * Every store needs an owner (a `store_manager`) before the org can go live.
 */
export default function MembersStep() {
  const { org } = useSetupOrg();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const { data: stores } = useStoresByOrg(org.id);
  const { data: orgMembers } = useOrganizationMembers(org.id);
  const { data: coverage } = useStoreManagerCoverage(org.id);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>({ kind: "list" });

  const canManage = hasPermission(entitlements, "staff.invite", {
    organizationId: org.id,
  });

  const ownerEmail =
    (orgMembers ?? []).find((m) => m.roleName === "org_owner")?.email ?? null;

  // Default the Store members tab to the first store when none is in the URL.
  const paramStoreId = params.get("store") ?? "";
  const selectedStoreId = paramStoreId || (stores?.[0]?.id ?? "");
  const setStore = (id: string) =>
    setParams(id ? { store: id } : {}, { replace: true });
  const selectedStore = (stores ?? []).find((s) => s.id === selectedStoreId);

  const backToList = () => setView({ kind: "list" });

  // Takeover: adding/editing replaces the whole step content with the form.
  if (view.kind !== "list") {
    const heading =
      view.kind === "org-add" || view.kind === "store-add"
        ? "Add member"
        : "Edit member";
    return (
      <div className="space-y-4">
        <BackLink onClick={backToList} />
        <Card title={heading}>
          {view.kind === "org-add" && (
            <MemberForm
              organizationId={org.id}
              onSuccess={backToList}
              onCancel={backToList}
            />
          )}
          {view.kind === "org-edit" && (
            <OrgMemberEditForm
              orgId={org.id}
              memberId={view.memberId}
              isPrimaryContact={org.primary_contact_member_id === view.memberId}
              onDone={backToList}
            />
          )}
          {view.kind === "store-add" && (
            <MemberForm
              organizationId={org.id}
              storeId={view.storeId}
              onSuccess={backToList}
              onCancel={backToList}
            />
          )}
          {view.kind === "store-edit" && (
            <StoreMemberEditForm
              orgId={org.id}
              storeId={view.storeId}
              memberId={view.memberId}
              onDone={backToList}
            />
          )}
        </Card>
      </div>
    );
  }

  const tabs: TabItem[] = [
    {
      id: "org-members",
      label: "Organization members",
      icon: <Users size={18} />,
      content: (
        <Card
          title="Organization members"
          desc="The people who run this organization. Add the owner (primary contact) here — it's required before going live."
        >
          <OrgMembersRow
            org={org}
            canManage={canManage}
            onAdd={() => setView({ kind: "org-add" })}
            onEdit={(memberId) => setView({ kind: "org-edit", memberId })}
          />
        </Card>
      ),
    },
    {
      id: "store-members",
      label: "Store members",
      icon: <StoreIcon size={18} />,
      content: (
        <Card
          title="Store members"
          desc="Pick a store to add its people. Every store needs an owner (Manager) before the org can go live."
          actions={
            <div className="w-56">
              <SingleSelect
                placeholder="Select a store…"
                value={selectedStoreId}
                onChange={(e) => setStore(e.target.value)}
                options={(stores ?? []).map((s) => ({
                  value: s.id,
                  label: s.store_code ? `${s.name} (${s.store_code})` : s.name,
                }))}
              />
            </div>
          }
        >
          {!selectedStore ? (
            <p className="text-sm text-fg-muted">
              Select a store above to add its members.
            </p>
          ) : (
            <StoreMembersRow
              storeId={selectedStore.id}
              storeName={selectedStore.name}
              storeCode={selectedStore.store_code}
              hasManager={coverage?.[selectedStore.id] ?? false}
              ownerEmail={ownerEmail}
              canManage={canManage}
              onAdd={() =>
                setView({ kind: "store-add", storeId: selectedStore.id })
              }
              onEdit={(memberId) =>
                setView({ kind: "store-edit", storeId: selectedStore.id, memberId })
              }
            />
          )}
        </Card>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Tabs
        items={tabs}
        defaultActiveId={paramStoreId ? "store-members" : "org-members"}
      />
      <SetupStepFooter back="stock-setup" next="go-live" nextLabel="Next: Go live →" />
    </div>
  );
}
