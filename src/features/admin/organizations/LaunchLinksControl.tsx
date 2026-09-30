import { Fragment, useState } from "react";
import { Link as LinkIcon, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Tabs } from "@/components/ui/tabs/Tabs";
import { useStoresByOrg } from "@/features/stores/stores";
import { Spinner } from "@/components/ui/Spinner";
import { useOrganizationMembers, type OrganizationFullDetail, type OrgMemberRow } from "./organizations";
import { roleDisplayName } from "../roles/roles";
import { useIssueDemoLaunchLink } from "../demo/components/demo.login";

/**
 * Card-level "Launch links" control (platform admin only — /admin/demo and
 * /admin/organizations). Opens a modal listing the org's members at every level (owner,
 * managers, store staff); for each, the admin can generate a short-lived link (30 min) that
 * signs in as that member and copy it — for demos, support, or driving the app with an AI
 * agent. Works for any organization, demo or not, without touching its is_demo flag
 * (founder, 2026-09-29). Reuses {@link useIssueDemoLaunchLink} (the demo-login edge function).
 */
export function LaunchLinksControl({ org }: { org: OrganizationFullDetail }) {
  const [open, setOpen] = useState(false);
  const { data: members, isLoading, isError } = useOrganizationMembers(org.id);
  const { data: stores } = useStoresByOrg(open ? org.id : undefined);
  const issueLink = useIssueDemoLaunchLink();

  const [tab, setTab] = useState<"org" | "stores">("org");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busyId = issueLink.isPending ? issueLink.variables : undefined;

  const copy = async (memberId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(memberId);
      setTimeout(
        () => setCopiedId((id) => (id === memberId ? null : id)),
        2000,
      );
    } catch {
      setError("Couldn't copy to clipboard — select and copy the link manually.");
    }
  };

  const generate = async (memberId: string) => {
    setError(null);
    try {
      const url = await issueLink.mutateAsync(memberId);
      setLinks((prev) => ({ ...prev, [memberId]: url }));
      await copy(memberId, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a launch link.");
    }
  };

  // Two tabs: the organization (org-level members) and stores (pick a store on the left, its
  // staff / managers on the right).
  const all = members ?? [];
  const orgMembers = all.filter((m) => !m.storeId);
  const storeList = stores ?? [];
  const selectedStore = storeList.find((s) => s.id === storeId) ?? storeList[0];
  const storeCount = (id: string) => all.filter((m) => m.storeId === id).length;
  const tabs = [
    { id: "org", label: `Organization (${orgMembers.length})` },
    { id: "stores", label: `Stores (${storeList.length})` },
  ];
  const shown =
    tab === "org" ? orgMembers : selectedStore ? all.filter((m) => m.storeId === selectedStore.id) : [];

  const table =
    shown.length === 0 ? (
      <p className="py-4 text-sm text-fg-muted">No members here yet.</p>
    ) : (
      // Wide table; scrolls sideways inside the modal on a phone.
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="bg-surface-2 text-xs font-medium text-fg-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Launch link</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <MemberRow
                key={m.membershipId}
                m={m}
                url={links[m.memberId]}
                busy={busyId === m.memberId}
                copied={copiedId === m.memberId}
                onGenerate={() => generate(m.memberId)}
                onCopy={(url) => copy(m.memberId, url)}
              />
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Launch links for ${org.name}`}
      >
        <LinkIcon size={16} />
        Launch links
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Launch links · ${org.name}`} size="xl">
        <p className="text-sm text-fg-muted">
          Generate a link that signs in as a member — share it so others can try the app, or use
          it to drive the app with an AI agent. Each link works for 30 minutes.
        </p>
        {!org.is_demo && (
          <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
            {org.name} is a real organization (not a demo): the link opens the app as that
            person, with their real data.
          </p>
        )}

        <div className="mt-4">
          <Tabs items={tabs} activeId={tab} onChange={(id) => setTab(id as "org" | "stores")} />
        </div>

        <div className="mt-3">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Spinner size={20} />
            </div>
          )}
          {isError && (
            <p className="text-sm text-red-500">Couldn&apos;t load members.</p>
          )}
          {!isLoading && !isError && tab === "org" && table}

          {!isLoading && !isError && tab === "stores" && (
            storeList.length === 0 ? (
              <p className="py-4 text-sm text-fg-muted">This organization has no stores yet.</p>
            ) : (
              // A single-select dropdown of the org's stores (any number of them), then the
              // selected store's members and their links.
              <div className="space-y-3">
                <div className="sm:max-w-sm">
                  <SingleSelect
                    aria-label="Store"
                    placeholder={null}
                    value={selectedStore?.id ?? ""}
                    onChange={(e) => setStoreId(e.target.value)}
                    options={storeList.map((st) => ({
                      value: st.id,
                      label: `${st.name}${st.store_code ? ` (${st.store_code})` : ""} · ${storeCount(st.id)} member${storeCount(st.id) === 1 ? "" : "s"}`,
                    }))}
                  />
                </div>
                <div className="min-w-0">{table}</div>
              </div>
            )
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** One member row; once a link exists, a second row under it shows the link + Copy. */
function MemberRow({
  m,
  url,
  busy,
  copied,
  onGenerate,
  onCopy,
}: {
  m: OrgMemberRow;
  url: string | undefined;
  busy: boolean;
  copied: boolean;
  onGenerate: () => void;
  onCopy: (url: string) => void;
}) {
  const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
  return (
    <Fragment>
      <tr className="border-t border-border align-middle">
        <td className="px-3 py-2 font-medium text-fg">{name}</td>
        <td className="px-3 py-2 text-fg-muted">{m.email}</td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-fg-muted">
            {roleDisplayName(m.roleName)}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <Button type="button" size="sm" onClick={onGenerate} disabled={busy}>
            {busy ? <Spinner size={16} /> : <LinkIcon size={16} />}
            {url ? "Regenerate" : "Generate link"}
          </Button>
        </td>
      </tr>
      {url && (
        <tr>
          <td colSpan={4} className="px-3 pb-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                aria-label={`Launch link for ${name}`}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => onCopy(url)}>
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
