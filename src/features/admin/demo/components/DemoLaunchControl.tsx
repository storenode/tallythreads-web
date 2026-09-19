import { useState } from "react";
import { Link as LinkIcon, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
  useOrganizationMembers,
  type OrganizationFullDetail,
} from "../../organizations/organizations";
import { roleDisplayName } from "../../roles/roles";
import { useIssueDemoLaunchLink } from "./demo.login";

/**
 * Card-level "Launch links" control for a demo org. Opens a modal listing the
 * org's members; for each, an admin can generate a short-lived link that signs
 * in as that member (owner or store staff) and copy it to the clipboard —
 * useful for sharing a playable demo or driving the app with an AI agent.
 * Reuses {@link useIssueDemoLaunchLink} (the demo-login edge function).
 */
export function DemoLaunchControl({ org }: { org: OrganizationFullDetail }) {
  const [open, setOpen] = useState(false);
  const { data: members, isLoading, isError } = useOrganizationMembers(org.id);
  const issueLink = useIssueDemoLaunchLink();

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

      <Modal open={open} onClose={() => setOpen(false)} title="Demo launch links">
        <p className="text-sm text-fg-muted">
          Generate a link that signs in as a demo member — share it so others can
          try the app, or use it to drive the app with an AI agent. Each link is
          short-lived.
        </p>

        <div className="mt-4 space-y-3">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Spinner size={20} />
            </div>
          )}
          {isError && (
            <p className="text-sm text-red-500">Couldn&apos;t load members.</p>
          )}
          {!isLoading && !isError && (members?.length ?? 0) === 0 && (
            <p className="text-sm text-fg-muted">No members to launch as yet.</p>
          )}

          {(members ?? []).map((m) => {
            const name =
              [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
            const url = links[m.memberId];
            return (
              <div
                key={m.membershipId}
                className="rounded-xl border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {name}
                    </p>
                    <p className="truncate text-xs text-fg-muted">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg-muted">
                      {roleDisplayName(m.roleName)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => generate(m.memberId)}
                      disabled={busyId === m.memberId}
                    >
                      {busyId === m.memberId ? (
                        <Spinner size={16} />
                      ) : (
                        <LinkIcon size={16} />
                      )}
                      {url ? "Regenerate" : "Generate link"}
                    </Button>
                  </div>
                </div>

                {url && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copy(m.memberId, url)}
                    >
                      {copiedId === m.memberId ? (
                        <Check size={16} className="text-emerald-500" />
                      ) : (
                        <Copy size={16} />
                      )}
                      {copiedId === m.memberId ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
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
