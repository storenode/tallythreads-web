import { useState } from "react";
import {
  Building2,
  Store as StoreIcon,
  Users,
  Star,
  Trash2,
  Link as LinkIcon,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { Organization } from "../../organizations/organizations";
import {
  useOrganizationMembers,
  useHardDeleteOrganization,
} from "../../organizations/organizations";
import { useStoresByOrg, type OrgStore } from "@/features/stores/stores";
import { useStore, useStoreMembers } from "@/features/stores/storesAdmin";
import {
  LEGAL_ENTITY_OPTIONS,
  STATUS_OPTIONS,
  FY_MONTH_OPTIONS,
} from "./chain.demo";
import { useIssueDemoLaunchLink } from "./demo.login";

// Self-contained: this file does not import from the independent.* demo files. The
// small presentational helpers below are local copies so Chain can evolve on its own.

const SANS = "'Plus Jakarta Sans', 'Inter', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const labelFor = (
  opts: readonly { value: string; label: string }[],
  value: string | number | null | undefined,
) => opts.find((o) => o.value === String(value ?? ""))?.label;

function Badge({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "green" | "amber";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    green:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${tones[tone]}`}
      style={{ fontFamily: MONO }}
    >
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt
        className="text-[11px] tracking-wide text-gray-400 uppercase dark:text-gray-500"
        style={{ fontFamily: MONO }}
      >
        {label}
      </dt>
      <dd
        className="mt-0.5 text-[13px] text-gray-800 dark:text-white/90"
        style={{ fontFamily: SANS }}
      >
        {value || <span className="text-gray-400 dark:text-gray-600">—</span>}
      </dd>
    </div>
  );
}

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h4
      className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"
      style={{ fontFamily: SANS }}
    >
      <span className="text-tt-green-500">{icon}</span>
      {children}
    </h4>
  );
}

interface MemberDisplay {
  membershipId: string;
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roleName: string;
  isPrimaryContact?: boolean;
}

interface LaunchProps {
  onCopyLink?: (memberId: string) => void;
  busyId?: string;
  copiedId?: string;
}

function MemberList({
  members,
  isLoading,
  isError,
  emptyText,
  onCopyLink,
  busyId,
  copiedId,
}: {
  members: MemberDisplay[];
  isLoading: boolean;
  isError: boolean;
  emptyText: string;
} & LaunchProps) {
  if (isLoading)
    return (
      <p className="text-[13px] text-gray-400 dark:text-gray-500">Loading…</p>
    );
  if (isError)
    return <p className="text-[13px] text-red-500">Couldn't load members.</p>;
  if (members.length === 0)
    return (
      <p className="text-[13px] text-gray-400 dark:text-gray-500">{emptyText}</p>
    );

  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-800">
      {members.map((m) => {
        const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || "—";
        return (
          <li
            key={m.membershipId}
            className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p
                className="flex items-center gap-1.5 truncate text-[13px] font-medium text-gray-800 dark:text-white/90"
                style={{ fontFamily: SANS }}
              >
                {name}
                {m.isPrimaryContact && (
                  <Star
                    size={12}
                    className="shrink-0 fill-amber-400 text-amber-400"
                    aria-label="Primary contact"
                  />
                )}
              </p>
              <p
                className="truncate text-[11px] text-gray-400 dark:text-gray-500"
                style={{ fontFamily: MONO }}
              >
                {m.email || "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone="green">{m.roleName}</Badge>
              {onCopyLink && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCopyLink(m.memberId)}
                  disabled={busyId === m.memberId}
                  title="Copy a link that logs in as this member"
                >
                  {busyId === m.memberId ? (
                    <Spinner size={16} />
                  ) : copiedId === m.memberId ? (
                    <Check size={16} className="text-emerald-500" />
                  ) : (
                    <LinkIcon size={16} />
                  )}
                  {copiedId === m.memberId ? "Copied!" : "Copy launch link"}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StoreBlock({
  store,
  onCopyLink,
  busyId,
  copiedId,
}: { store: OrgStore } & LaunchProps) {
  const { data: detail } = useStore(store.id);
  const { data: members, isLoading, isError } = useStoreMembers(store.id);
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-[13px] font-medium text-gray-800 dark:text-white/90"
          style={{ fontFamily: SANS }}
        >
          {store.name}
        </p>
        {store.store_code && <Badge>{store.store_code}</Badge>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field
          label="Hours"
          value={
            detail?.opening_time && detail?.closing_time
              ? `${detail.opening_time.slice(0, 5)}–${detail.closing_time.slice(0, 5)}`
              : null
          }
        />
        <Field
          label="City"
          value={[detail?.city, detail?.state].filter(Boolean).join(", ")}
        />
        <Field label="GSTIN" value={detail?.gstin} />
        <Field label="Phone" value={detail?.phone_number} />
      </dl>
      <div className="mt-3">
        <p
          className="mb-1.5 text-[11px] tracking-wide text-gray-400 uppercase dark:text-gray-500"
          style={{ fontFamily: MONO }}
        >
          Store members
        </p>
        <MemberList
          members={(members ?? []).map((m) => ({
            membershipId: m.membershipId,
            memberId: m.memberId,
            firstName: m.firstName,
            lastName: m.lastName,
            email: m.email,
            roleName: m.roleName,
          }))}
          isLoading={isLoading}
          isError={isError}
          emptyText="No store members yet."
          onCopyLink={onCopyLink}
          busyId={busyId}
          copiedId={copiedId}
        />
      </div>
    </div>
  );
}

function DeleteOrgControl({ organization }: { organization: Organization }) {
  const [confirming, setConfirming] = useState(false);
  const deleteOrg = useHardDeleteOrganization();

  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="hidden text-[13px] text-gray-500 sm:inline dark:text-gray-400"
          style={{ fontFamily: SANS }}
        >
          Delete this demo?
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={deleteOrg.isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="!bg-red-500 hover:enabled:!bg-red-600"
          onClick={() => deleteOrg.mutate(organization.id)}
          disabled={deleteOrg.isPending}
        >
          {deleteOrg.isPending ? <Spinner size={16} /> : <Trash2 size={16} />}
          Confirm delete
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 !text-red-500 hover:enabled:!bg-red-500/10"
      onClick={() => setConfirming(true)}
    >
      <Trash2 size={16} />
      Delete organization
    </Button>
  );
}

export default function ChainCard({
  organization,
}: {
  organization: Organization;
}) {
  const {
    data: stores,
    isLoading: storesLoading,
    isError: storesError,
  } = useStoresByOrg(organization.id);
  const {
    data: orgMembers,
    isLoading: membersLoading,
    isError: membersError,
  } = useOrganizationMembers(organization.id);

  const issueLink = useIssueDemoLaunchLink();
  const [copiedId, setCopiedId] = useState<string | undefined>(undefined);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(true);

  const handleCopyLink = async (memberId: string) => {
    setLaunchError(null);
    try {
      const url = await issueLink.mutateAsync(memberId);
      await navigator.clipboard.writeText(url);
      setCopiedId(memberId);
      setTimeout(
        () => setCopiedId((id) => (id === memberId ? undefined : id)),
        2000,
      );
    } catch (e) {
      setLaunchError(
        e instanceof Error ? e.message : "Couldn't create a launch link.",
      );
    }
  };
  const busyId = issueLink.isPending ? issueLink.variables : undefined;

  const location = [organization.city, organization.state, organization.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="text-xl font-medium text-gray-800 dark:text-white/90"
              style={{ fontFamily: SANS }}
            >
              {organization.legal_name || organization.name}
            </h3>
            {organization.is_demo && <Badge tone="amber">Demo</Badge>}
            <button
              type="button"
              onClick={() => setShowAbout((v) => !v)}
              aria-expanded={showAbout}
              className={`inline-block cursor-pointer rounded-full ${showAbout ? "bg-blue-100 hover:bg-blue-50 dark:bg-blue-500/20 dark:hover:bg-blue-500/10" : "bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20"} px-2 py-0.5 text-[10px] font-medium tracking-wide text-blue-600 uppercase transition-colors dark:text-blue-400`}
              style={{ fontFamily: MONO }}
            >
              About
            </button>
          </div>
          {location && (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {location}
              {organization.pincode ? ` - ${organization.pincode}` : ""}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>Registration · Chain</Badge>
            <Badge tone="green">
              {labelFor(STATUS_OPTIONS, organization.status) ??
                organization.status}
            </Badge>
          </div>
        </div>
        <DeleteOrgControl organization={organization} />
      </div>

      {/* About the Chain registration type */}
      {showAbout && (
        <div>
          <p
            className="mt-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400"
            style={{ fontFamily: SANS }}
          >
            A{" "}
            <span className="font-semibold text-gray-800 dark:text-white/90">
              Chain
            </span>{" "}
            registration is for a single business that owns and runs several
            stores or branches itself under one legal entity. Here,{" "}
            <span className="font-semibold text-gray-800 dark:text-white/90">
              {organization.legal_name || organization.name}
            </span>{" "}
            operates every branch centrally — one company, one GSTIN and PAN,
            with inventory, pricing, and staff managed together across locations.
          </p>
          <p
            className="mt-3 text-[13px] leading-relaxed text-gray-400 dark:text-gray-500"
            style={{ fontFamily: SANS }}
          >
            This is different from a franchise, where each outlet is owned and
            run by an independent franchisee. In TallyThreads, a chain is one
            organization with multiple stores registered under it, and staff are
            assigned per store while the owner oversees the whole organization.
          </p>
        </div>
      )}

      {/* Organization details */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <SectionHeading icon={<Building2 size={16} />}>
          Organization
        </SectionHeading>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field
            label="Legal entity"
            value={labelFor(LEGAL_ENTITY_OPTIONS, organization.legal_entity_type)}
          />
          <Field label="GSTIN" value={organization.gstin} />
          <Field label="PAN" value={organization.pan} />
          <Field
            label="FY starts"
            value={labelFor(
              FY_MONTH_OPTIONS,
              organization.financial_year_start_month,
            )}
          />
          <Field label="Language" value={organization.preferred_language} />
          <Field label="Phone" value={organization.primary_contact_phone} />
          <Field label="Website" value={organization.website} />
          <Field
            label="Address"
            value={[organization.address_line1, organization.address_line2]
              .filter(Boolean)
              .join(", ")}
          />
        </dl>
      </div>

      {/* Organization members */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <SectionHeading icon={<Users size={16} />}>
          Organization members
        </SectionHeading>
        <MemberList
          members={(orgMembers ?? [])
            // A store-scoped membership also carries the parent org_id, so
            // fetchOrganizationMembers returns store members too. Keep this
            // section to org-scoped roles; store members show under their store.
            .filter((m) => !m.roleName.startsWith("store_"))
            .map((m) => ({
              membershipId: m.membershipId,
              memberId: m.memberId,
              firstName: m.firstName,
              lastName: m.lastName,
              email: m.email,
              roleName: m.roleName,
              isPrimaryContact:
                m.memberId === organization.primary_contact_member_id,
            }))}
          isLoading={membersLoading}
          isError={membersError}
          emptyText="No organization members yet."
          onCopyLink={handleCopyLink}
          busyId={busyId}
          copiedId={copiedId}
        />
        {launchError && (
          <p className="mt-2 text-[13px] text-red-500">{launchError}</p>
        )}
      </div>

      {/* Stores */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <SectionHeading icon={<StoreIcon size={16} />}>Stores</SectionHeading>
        {storesLoading ? (
          <p className="text-[13px] text-gray-400 dark:text-gray-500">
            Loading stores…
          </p>
        ) : storesError ? (
          <p className="text-[13px] text-red-500">Couldn't load stores.</p>
        ) : (stores ?? []).length === 0 ? (
          <p className="text-[13px] text-gray-400 dark:text-gray-500">
            No stores registered under this organization yet.
          </p>
        ) : (
          <div className="space-y-3">
            {stores!.map((store) => (
              <StoreBlock
                key={store.id}
                store={store}
                onCopyLink={handleCopyLink}
                busyId={busyId}
                copiedId={copiedId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
