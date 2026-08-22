import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAuthClient } from "@/lib/supabaseAuthClient";
import { getDeviceId } from "@/lib/deviceId";
import { cacheActiveMember } from "@/lib/memberSession";
import type { Member } from "@/db";

interface MintResponse {
  jwt: string;
  member: Omit<Member, "jwt" | "is_active" | "cached_at">;
}

const log = (...args: unknown[]) => console.log("[AuthCallbackPage]", ...args);

/**
 * Lands here after Google's consent screen redirects back through Supabase.
 * supabase-js parses the session from the URL automatically (detectSessionInUrl).
 * From there: call mint-member-session with that disposable OAuth session's token
 * (plus this device's id, so the server can enroll it), cache the returned member
 * profile + JWT, discard the OAuth session, then always route through PIN creation —
 * every Google sign-in on a device (first-ever or repeat) forces a fresh PIN for that
 * device, per specs/tasks/M1a-identity-auth.md Task 2.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // React 18 StrictMode double-invokes effects in dev, which previously fired two
  // concurrent sign-in attempts — one could fail (e.g. a transient upstream error)
  // and overwrite the UI state set by the other one succeeding. This isn't a
  // per-render `cancelled` flag (that still let both attempts run to completion,
  // racing) — it's a ref so the second invocation is skipped outright.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) {
      log("skipping duplicate effect run (React StrictMode double-invoke)");
      return;
    }
    hasRun.current = true;

    async function run() {
      log("starting, url =", window.location.href);

      const {
        data: { session },
        error: sessionError,
      } = await supabaseAuthClient.auth.getSession();
      log("getSession ->", { hasSession: Boolean(session), sessionError });

      if (sessionError || !session) {
        setError("Sign-in didn't complete. Please try again.");
        return;
      }

      const deviceId = getDeviceId();
      log("invoking mint-member-session with access_token prefix", session.access_token.slice(0, 12));
      const { data, error: fnError } = await supabaseAuthClient.functions.invoke<MintResponse>(
        "mint-member-session",
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { device_id: deviceId },
        },
      );
      log("mint-member-session ->", { data, fnError });
      if (fnError && "context" in fnError && fnError.context instanceof Response) {
        // FunctionsHttpError's message is just "non-2xx status code" — the actual
        // reason is in the response body, which supabase-js doesn't surface for you.
        const body = await fnError.context.clone().text();
        log("mint-member-session error body ->", body);
      }

      // The Supabase-managed OAuth session was only a credential check — best-effort
      // discard it, but don't let a failure here block the actual sign-in outcome.
      try {
        const { error: signOutError } = await supabaseAuthClient.auth.signOut({ scope: "local" });
        log("signOut ->", { signOutError });
      } catch (e) {
        log("signOut threw (non-blocking):", e);
      }

      if (fnError || !data) {
        log("failing: fnError or missing data", fnError);
        setError("Couldn't finish signing you in. Please try again.");
        return;
      }

      await cacheActiveMember(data.member, data.jwt);
      log("member cached, navigating to PIN creation");
      navigate("/auth/set-pin", { replace: true });
    }

    run();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-center">
      <p className="text-fg-muted">
        {error ?? "Signing you in…"}
      </p>
    </div>
  );
}
