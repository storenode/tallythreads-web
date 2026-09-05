import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseAuthClient } from "@/lib/supabaseAuthClient";
import { cacheActiveMember } from "@/lib/memberSession";
import { resolvePostSignInPath } from "@/features/auth/resolvePostSignInPath";
import type { Member } from "@/db";

interface RedeemResponse {
  jwt: string;
  member: Omit<Member, "jwt" | "is_active" | "cached_at">;
}

const log = (...args: unknown[]) => console.log("[DemoLaunchPage]", ...args);

function readTokenFromHash(): string | null {
  // Token rides in the hash fragment (#token=...) so it never reaches server logs or
  // Referer headers. Support a bare "#<token>" too, just in case.
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get("token") ?? hash;
  return token ? decodeURIComponent(token) : null;
}

/**
 * Public landing for a demo launch link. Exchanges the grant token in the URL hash for
 * a real member session (via the demo-login edge function), caches it exactly as a
 * normal Google/PIN sign-in would (cacheActiveMember + resolvePostSignInPath →
 * primeEntitlements), then routes to the member's area. Auto-runs on load so an
 * automated QA agent needs no interaction.
 */
export default function DemoLaunchPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // React StrictMode double-invokes effects in dev; a ref ensures we redeem only once.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function run() {
      const token = readTokenFromHash();
      if (!token) {
        setError("This demo link is missing its token. Ask for a new one.");
        return;
      }

      const { data, error: fnError } =
        await supabaseAuthClient.functions.invoke<RedeemResponse>("demo-login", {
          body: { action: "redeem", token },
        });

      if (fnError || !data) {
        let message = "This demo link is invalid or has expired. Ask for a new one.";
        if (fnError && "context" in fnError && fnError.context instanceof Response) {
          try {
            const body = await fnError.context.clone().json();
            if (typeof body?.error === "string") message = body.error;
          } catch {
            /* keep fallback */
          }
        }
        log("redeem failed", fnError);
        setError(message);
        return;
      }

      // Identical to a normal login: (1) cache the active member + JWT, then
      // (2) resolvePostSignInPath, which primes entitlements into React Query + Dexie.
      await cacheActiveMember(data.member, data.jwt);
      const destination = await resolvePostSignInPath(queryClient, data.member.id);
      log("session cached, navigating to", destination);
      navigate(destination, { replace: true });
    }

    run();
  }, [navigate, queryClient]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-center">
      <p className={error ? "text-sm text-red-500" : "text-fg-muted"}>
        {error ?? "Opening the demo…"}
      </p>
    </div>
  );
}
