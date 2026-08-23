import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAuthClient } from "@/lib/supabaseAuthClient";
import { getDeviceId } from "@/lib/deviceId";
import { cacheActiveMember } from "@/lib/memberSession";
import { resolvePostSignInPath } from "@/features/auth/resolvePostSignInPath";
import { getRememberedEmail, setRememberedEmail, clearRememberedEmail } from "@/lib/rememberedEmail";
import { Button } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/features/home/components/GoogleSignInButton";
import type { Member } from "@/db";

interface VerifyPinResponse {
  jwt: string;
  member: Omit<Member, "jwt" | "is_active" | "cached_at">;
}

/**
 * Unified sign-in destination for a returning user: PIN entry (for a device already
 * enrolled via a prior Google sign-in) with Google offered as a fallback right below
 * it. Replaces the standalone /auth/pin route — see specs/tasks/M1a-identity-auth.md
 * Task 3. Sign *up* stays Google-only and lives on the marketing pages, not here.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => getRememberedEmail() ?? "");
  const [pin, setPin] = useState("");
  const [rememberMe, setRememberMe] = useState(() => getRememberedEmail() !== null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { data, error: fnError } = await supabaseAuthClient.functions.invoke<VerifyPinResponse>(
      "verify-pin",
      { body: { email, pin, device_id: getDeviceId() } },
    );

    setIsSubmitting(false);

    if (fnError || !data) {
      let message = "Couldn't sign you in. Please try again.";
      if (fnError && "context" in fnError && fnError.context instanceof Response) {
        try {
          const body = await fnError.context.clone().json();
          if (typeof body?.error === "string") message = body.error;
        } catch {
          // fall back to the generic message
        }
      }
      setError(message);
      return;
    }

    if (rememberMe) {
      setRememberedEmail(email);
    } else {
      clearRememberedEmail();
    }

    await cacheActiveMember(data.member, data.jwt);
    const destination = await resolvePostSignInPath(data.member.id);
    navigate(destination, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface-2 p-6">
        <div>
          <h1 className="text-lg font-semibold text-fg">Sign in</h1>
          <p className="mt-1 text-sm text-fg-muted">
            PIN sign-in only works on a device you've already signed into with Google.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-fg outline-none focus:border-parda-green-500"
            />
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-fg outline-none focus:border-parda-green-500"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-4 cursor-pointer rounded border-border accent-parda-green-500"
            />
            Remember my email on this device
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Signing in…" : "Sign in with PIN"}
          </Button>
        </form>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium tracking-wide text-fg-muted uppercase">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <GoogleSignInButton label="Sign in with Google" className="w-full" />
      </div>
    </div>
  );
}
