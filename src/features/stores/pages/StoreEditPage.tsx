import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { useLoadingGate } from "@/hooks/useLoadingGate";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements, hasPermission } from "@/features/auth/entitlements";
import { roleDisplayName } from "@/features/admin/roles/roles";
import { StoreDetailsFields } from "../StoreDetailsFields";
import {
  useArchiveStore,
  useHardDeleteStore,
  useRestoreStore,
  useRevokeStoreMember,
  useStore,
  useStoreMembers,
  useUpdateStore,
} from "../storesAdmin";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const s = (v: string | null | undefined) => v ?? "";

const editStoreSchema = z.object({
  name: z.string().trim().min(1, "Store name is required"),
  store_code: z.string(),
  address_line1: z.string(),
  address_line2: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string(),
  phone_number: z.string(),
  email: z.string(),
  gstin: z.string(),
  opening_time: z.string(),
  closing_time: z.string(),
});

type EditStoreValues = z.infer<typeof editStoreSchema>;

function StoreMembersCard({
  orgId,
  storeId,
}: {
  orgId: string;
  storeId: string;
}) {
  const editHref = (memberId: string) =>
    `/org/${orgId}/stores/${storeId}/members/${memberId}/edit`;
  const navigate = useNavigate();
  const { data: members, isLoading, isError } = useStoreMembers(storeId);
  const revokeMember = useRevokeStoreMember(storeId);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleRevoke = async (membershipId: string) => {
    setRevokeError(null);
    try {
      await revokeMember.mutateAsync(membershipId);
      setConfirmingId(null);
    } catch (err) {
      setRevokeError(errorMessage(err, "Couldn't remove this member."));
    }
  };

  return (
    <Card
      title="Members"
      desc="Everyone with access to this store."
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate(`/org/${orgId}/stores/${storeId}/members/new`)
          }
        >
          Add member
        </Button>
      }
    >
      {isLoading && (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      )}
      {isError && (
        <p className="text-sm text-red-500">Couldn&apos;t load members.</p>
      )}

      {!isLoading && !isError && (members?.length ?? 0) === 0 && (
        <p className="text-sm text-fg-muted">No members yet.</p>
      )}

      {!isLoading && !isError && (members?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {members!.map((m) => {
            const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
            return (
              <div
                key={m.membershipId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <Link to={editHref(m.memberId)} className="group">
                  <p className="text-sm font-medium text-fg group-hover:text-tt-green-600 group-hover:underline">
                    {name || m.email}
                  </p>
                  <p className="text-xs text-fg-muted group-hover:text-tt-green-600 group-hover:underline">
                    {m.email}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
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

                  {confirmingId === m.membershipId ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-red-500 hover:enabled:bg-red-600"
                        onClick={() => handleRevoke(m.membershipId)}
                        disabled={revokeMember.isPending}
                      >
                        {revokeMember.isPending ? "Removing…" : "Confirm"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="border-red-500/50 text-red-500 hover:enabled:bg-red-500/10"
                      onClick={() => setConfirmingId(m.membershipId)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {revokeError && <p className="mt-2 text-sm text-red-500">{revokeError}</p>}
    </Card>
  );
}

export default function StoreEditPage() {
  const { orgId, storeId } = useParams<{ orgId: string; storeId: string }>();
  const navigate = useNavigate();
  const { data: store, isLoading, isError } = useStore(storeId);
  const updateStore = useUpdateStore();
  const archiveStore = useArchiveStore(orgId);
  const restoreStore = useRestoreStore(orgId);
  const hardDeleteStore = useHardDeleteStore(orgId);
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  // store.delete is org_owner-only (not org_manager) — see M-role-permission-model.md
  // §3. hasPermission() already treats platform_admin as an automatic pass, so this
  // one check covers both "platform admin" and "org_owner with store.delete" without
  // needing a separate isPlatformAdmin flag. Gates Archive, Restore, and Delete
  // permanently alike — all three are delete-shaped actions now, unlike store.edit
  // (name/address/contact/hours), which org_manager keeps.
  const canDelete = hasPermission(entitlements, "store.delete", {
    organizationId: orgId,
  });

  const { isLoading: isSaving, withLoading } = useLoadingGate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const listTo = `/org/${orgId}/stores`;

  const form = useForm<EditStoreValues>({
    resolver: zodResolver(editStoreSchema) as Resolver<EditStoreValues>,
    values: store
      ? {
          name: store.name,
          store_code: s(store.store_code),
          address_line1: s(store.address_line1),
          address_line2: s(store.address_line2),
          city: s(store.city),
          state: s(store.state),
          pincode: s(store.pincode),
          country: s(store.country),
          phone_number: s(store.phone_number),
          email: s(store.email),
          gstin: s(store.gstin),
          opening_time: s(store.opening_time),
          closing_time: s(store.closing_time),
        }
      : undefined,
  });
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = form;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  if (isError || !store || !orgId || !storeId) {
    return (
      <div className="space-y-4">
        <PageHeading>Store not found</PageHeading>
        <p className="text-sm text-fg-muted">
          This store doesn&apos;t exist or couldn&apos;t be loaded.
        </p>
        <Link to={listTo} className="text-sm font-medium text-tt-green-600">
          ← Back to stores
        </Link>
      </div>
    );
  }

  const isArchived = !!store.deleted_at;

  const onSubmit = (values: EditStoreValues) =>
    withLoading(async () => {
      setServerError(null);
      const patch: Record<string, string | null> = {};
      if (dirtyFields.name) patch.name = values.name.trim();
      if (dirtyFields.store_code) patch.store_code = values.store_code.trim() || null;
      if (dirtyFields.address_line1)
        patch.address_line1 = values.address_line1.trim() || null;
      if (dirtyFields.address_line2)
        patch.address_line2 = values.address_line2.trim() || null;
      if (dirtyFields.city) patch.city = values.city.trim() || null;
      if (dirtyFields.state) patch.state = values.state.trim() || null;
      if (dirtyFields.pincode) patch.pincode = values.pincode.trim() || null;
      if (dirtyFields.country) patch.country = values.country.trim() || null;
      if (dirtyFields.phone_number)
        patch.phone_number = values.phone_number.trim() || null;
      if (dirtyFields.email) patch.email = values.email.trim() || null;
      if (dirtyFields.gstin) patch.gstin = values.gstin.trim() || null;
      if (dirtyFields.opening_time)
        patch.opening_time = values.opening_time || null;
      if (dirtyFields.closing_time)
        patch.closing_time = values.closing_time || null;

      if (Object.keys(patch).length === 0) return;

      try {
        await updateStore.mutateAsync({ id: storeId, patch });
      } catch (err) {
        setServerError(errorMessage(err, "Couldn't save your changes."));
      }
    });

  const handleArchive = () =>
    withLoading(async () => {
      setArchiveError(null);
      try {
        await archiveStore.mutateAsync(storeId);
        setArchiveConfirmOpen(false);
      } catch (err) {
        setArchiveConfirmOpen(false);
        setArchiveError(errorMessage(err, "Couldn't archive the store."));
      }
    });

  const handleRestore = () =>
    withLoading(async () => {
      setRestoreError(null);
      try {
        await restoreStore.mutateAsync(storeId);
      } catch (err) {
        setRestoreError(errorMessage(err, "Couldn't restore the store."));
      }
    });

  const handleHardDelete = () =>
    withLoading(async () => {
      setDeleteError(null);
      try {
        await hardDeleteStore.mutateAsync(storeId);
        navigate(listTo);
      } catch (err) {
        setDeleteError(errorMessage(err, "Couldn't delete the store."));
      }
    });

  return (
    <div className="space-y-6">
      <LoadingOverlay show={isSaving} scope="page" label="Saving…" />

      <PageHeading
        action={
          <Link
            to={listTo}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        {store.name}
      </PageHeading>

      {isArchived && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tt-lavender-500/40 bg-tt-lavender-500/5 p-4">
          <p className="text-sm text-fg-muted">
            This store is archived and hidden from the console.
            {!canDelete &&
              " Ask an org owner or platform admin to restore it."}
          </p>
          {canDelete && (
            <Button
              type="button"
              size="sm"
              onClick={handleRestore}
              disabled={restoreStore.isPending}
            >
              {restoreStore.isPending ? "Restoring…" : "Restore"}
            </Button>
          )}
        </div>
      )}
      {restoreError && <p className="text-sm text-red-500">{restoreError}</p>}

      <FormProvider {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card title="Store">
            <div className="space-y-4">
              <Input
                label="Store name"
                error={errors.name?.message}
                {...register("name")}
              />
              <Input
                label="Store code"
                error={errors.store_code?.message}
                {...register("store_code")}
              />
            </div>
          </Card>

          <Card
            title="Store details"
            desc="Address, contact, GST, and business hours. Optional."
          >
            <StoreDetailsFields />
          </Card>

          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(listTo)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </FormProvider>

      <StoreMembersCard orgId={orgId} storeId={storeId} />

      {canDelete && (
        <Card title="Danger zone">
          {!isArchived && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-fg-muted">
                Archiving hides this store from the console. It can be
                restored later from here or from an org owner/platform admin.
              </p>
              <Button
                type="button"
                variant="ghost"
                className="border-red-500/50 text-red-500 hover:enabled:bg-red-500/10"
                onClick={() => setArchiveConfirmOpen(true)}
                disabled={isSaving}
              >
                Archive
              </Button>
            </div>
          )}

          <div
            className={
              isArchived
                ? "flex items-center justify-between gap-4"
                : "flex items-center justify-between gap-4 border-t border-border pt-6"
            }
          >
            <p className="text-sm text-fg-muted">
              Permanently deletes this store and its entire footprint: members,
              invitations, channels, franchise links, and access grants. This
              cannot be undone.
            </p>
            <Button
              type="button"
              className="bg-red-500 hover:enabled:bg-red-600"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isSaving}
            >
              Delete permanently
            </Button>
          </div>

          {archiveError && (
            <p className="text-sm text-red-500">{archiveError}</p>
          )}
        </Card>
      )}

      <Modal
        open={archiveConfirmOpen}
        onClose={() => setArchiveConfirmOpen(false)}
        title="Archive store?"
      >
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{store.name}</span> will be
          soft-deleted and removed from the console. It can be restored later.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setArchiveConfirmOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-red-500 hover:enabled:bg-red-600"
            onClick={handleArchive}
            disabled={archiveStore.isPending}
          >
            {archiveStore.isPending ? "Archiving…" : "Archive"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setConfirmName("");
          setDeleteError(null);
        }}
        title="Delete store permanently?"
      >
        <p className="text-sm text-fg-muted">
          This permanently removes{" "}
          <span className="font-medium text-fg">{store.name}</span> and its
          entire footprint. This cannot be undone.
        </p>
        <label className="mt-3 block text-xs text-fg-muted">
          Type <span className="font-medium text-fg">{store.name}</span> to
          confirm
        </label>
        <input
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={store.name}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg"
        />
        {deleteError && (
          <p className="mt-3 text-sm text-red-500">{deleteError}</p>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDeleteConfirmOpen(false);
              setConfirmName("");
              setDeleteError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-red-500 hover:enabled:bg-red-600"
            onClick={handleHardDelete}
            disabled={confirmName.trim() !== store.name || isSaving}
          >
            {isSaving ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
