import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { Organization } from "../organizations/organizations";
import { useStoresByOrg, type OrgStore } from "@/features/stores/stores";
import {
  useFranchiseGroupByOrg,
  useFranchiseMemberships,
  useCreateFranchiseGroup,
  useLinkStoreToFranchise,
  useUpdateFranchiseMembership,
  useUnlinkStore,
  type FranchiseGroup,
  type FranchiseMembership,
} from "./franchiseGroups";

const today = () => new Date().toISOString().slice(0, 10);

function CreateGroup({ org }: { org: Organization }) {
  const createGroup = useCreateFranchiseGroup(org.id);
  const [name, setName] = useState(`${org.name} Franchise Network`);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Give the franchise group a name.");
      return;
    }
    try {
      await createGroup.mutateAsync(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the group.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        This organization isn't set up as a franchise yet. Create a franchise
        group to link its stores under an agreement.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Franchise group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error ?? undefined}
            disabled={createGroup.isPending}
          />
        </div>
        <Button onClick={handleCreate} disabled={createGroup.isPending}>
          {createGroup.isPending && <Spinner size={16} />}
          Create franchise group
        </Button>
      </div>
    </div>
  );
}

function StoreRow({
  orgId,
  store,
  membership,
}: {
  orgId: string;
  store: OrgStore;
  membership: FranchiseMembership | undefined;
}) {
  const link = useLinkStoreToFranchise(orgId);
  const updateMembership = useUpdateFranchiseMembership(orgId);
  const unlink = useUnlinkStore(orgId);

  // Draft state for the link / edit date inputs.
  const [start, setStart] = useState(membership?.agreement_start ?? today());
  const [end, setEnd] = useState(membership?.agreement_end ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = link.isPending || updateMembership.isPending || unlink.isPending;

  const handleLink = async (groupId: string | undefined) => {
    setError(null);
    if (!groupId) return;
    if (!start) {
      setError("Set an agreement start date.");
      return;
    }
    try {
      await link.mutateAsync({
        storeId: store.id,
        groupId,
        agreementStart: start,
        agreementEnd: end || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't link the store.");
    }
  };

  const handleSave = async () => {
    if (!membership) return;
    setError(null);
    if (!start) {
      setError("Set an agreement start date.");
      return;
    }
    try {
      await updateMembership.mutateAsync({
        id: membership.id,
        patch: { agreement_start: start, agreement_end: end || null },
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the agreement.");
    }
  };

  const handleUnlink = async () => {
    if (!membership) return;
    setError(null);
    try {
      await unlink.mutateAsync(membership.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlink the store.");
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{store.name}</p>
          {store.store_code && (
            <p className="text-xs text-fg-muted">{store.store_code}</p>
          )}
        </div>
        {membership && !editing && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">
              {membership.agreement_start}
              {" → "}
              {membership.agreement_end ?? "Active"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="!text-red-500 hover:enabled:!bg-red-500/10"
              onClick={handleUnlink}
              disabled={busy}
            >
              {unlink.isPending ? <Spinner size={14} /> : "Unlink"}
            </Button>
          </div>
        )}
      </div>

      {(!membership || editing) && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="Agreement start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={busy}
          />
          <Input
            label="Agreement end (optional)"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={busy}
          />
          {membership ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={busy}>
                {updateMembership.isPending ? <Spinner size={14} /> : "Save"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setStart(membership.agreement_start);
                  setEnd(membership.agreement_end ?? "");
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <FranchiseLinkButton orgId={orgId} onLink={handleLink} busy={busy} />
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

/** Resolves the group id for this org and links on click. */
function FranchiseLinkButton({
  orgId,
  onLink,
  busy,
}: {
  orgId: string;
  onLink: (groupId: string | undefined) => void;
  busy: boolean;
}) {
  const { data: group } = useFranchiseGroupByOrg(orgId);
  return (
    <Button size="sm" onClick={() => onLink(group?.id)} disabled={busy}>
      {busy ? <Spinner size={14} /> : "Link to franchise"}
    </Button>
  );
}

function LinkedStores({
  org,
  group,
}: {
  org: Organization;
  group: FranchiseGroup;
}) {
  const {
    data: stores,
    isLoading: storesLoading,
    isError: storesError,
  } = useStoresByOrg(org.id);
  const {
    data: memberships,
    isLoading: mLoading,
    isError: mError,
  } = useFranchiseMemberships(org.id, group.id);

  const byStore = new Map(
    (memberships ?? []).map((m) => [m.store_id, m] as const),
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Franchise group:{" "}
        <span className="font-medium text-fg">{group.name}</span>
      </p>

      {(storesLoading || mLoading) && (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      )}
      {(storesError || mError) && (
        <p className="text-sm text-red-500">Couldn't load stores.</p>
      )}

      {!storesLoading &&
        !mLoading &&
        !storesError &&
        !mError &&
        (stores?.length ?? 0) === 0 && (
          <p className="text-sm text-fg-muted">
            This organization has no stores to link yet.
          </p>
        )}

      {!storesLoading && !mLoading && (stores?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {stores!.map((store) => (
            <StoreRow
              key={store.id}
              orgId={org.id}
              store={store}
              membership={byStore.get(store.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FranchiseCard({ org }: { org: Organization }) {
  const { data: group, isLoading, isError } = useFranchiseGroupByOrg(org.id);

  return (
    <Card
      title="Franchise"
      desc="Group this organization's stores under a franchise agreement."
    >
      {isLoading && (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      )}
      {isError && (
        <p className="text-sm text-red-500">
          Couldn't load franchise details.
        </p>
      )}
      {!isLoading && !isError && !group && <CreateGroup org={org} />}
      {!isLoading && !isError && group && (
        <LinkedStores org={org} group={group} />
      )}
    </Card>
  );
}
