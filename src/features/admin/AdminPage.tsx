import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useMember } from "@/features/auth/useMember";
import { signOut } from "@/features/auth/signOut";

/**
 * Landing page for a platform_admin right after sign-in — static placeholder until
 * the real platform-admin console (organization provisioning, etc.) is built. See
 * M1b-Core-Tenancy-Schema.md §4/§5.
 */
export default function AdminPage() {
  const navigate = useNavigate();
  const { member } = useMember();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-semibold text-fg">Platform admin</h1>
        <p className="text-sm text-fg-muted">
          Signed in as {member?.google_email ?? "platform admin"}. The admin console
          isn't built yet — this is a placeholder landing page.
        </p>
        <Button variant="ghost" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
