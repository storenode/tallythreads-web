import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useMember } from "@/features/auth/useMember";
import { signOut } from "@/features/auth/signOut";

/**
 * Landed on whenever a signed-in member has no associated store. Until Phase M1b
 * ships `memberships`, that's *every* member, always — this is intentional UI/route
 * scaffolding for M1b to route into, not a fully meaningful check yet. See
 * specs/tasks/M1a-identity-auth.md's "No store assigned page and M1b" note.
 */
export default function NoStoreAssignedPage() {
  const navigate = useNavigate();
  const { member } = useMember();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-semibold text-fg">No store assigned yet</h1>
        <p className="text-sm text-fg-muted">
          {member?.google_email ?? "This account"} isn't linked to a store yet. Ask
          your store owner to invite you, or contact TallyThreads support.
        </p>
        <Button variant="ghost" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
