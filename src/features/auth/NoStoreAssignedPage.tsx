import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { useMember } from "@/features/auth/useMember";
import { signOut } from "@/features/auth/signOut";

/**
 * The generic post-login landing page — where resolvePostSignInPath sends every
 * member right now (see its comment). Renamed in spirit, not in file/route path, as
 * part of the 2026-08-29 frontend cleanup: this used to be "no store assigned yet"
 * messaging tied to the org/store invite flow, which was removed along with the
 * admin console and org portal. This is intentionally a bare placeholder — build the
 * next real screen and update resolvePostSignInPath.ts to send people there instead.
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
      <div className="max-w-sm space-y-4">
        <div className="flex justify-center">
          <Logo size="sm" />
        </div>
        <h1 className="text-lg font-semibold text-fg">You're signed in</h1>
        <p className="text-sm text-fg-muted">
          {member?.google_email ?? "This account"} is signed in. There's nothing
          built here yet — this is the placeholder landing page for what comes next.
        </p>
        <Button variant="ghost" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
