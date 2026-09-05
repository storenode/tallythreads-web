import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

interface IssueResponse {
  token: string;
  expires_at: string;
}

/**
 * Issues a short-lived "launch as this demo member" link (platform-admin only). The
 * caller's admin JWT authorizes the request; the returned URL carries a grant token in
 * its hash fragment, which /demo/launch redeems for a real member session — see the
 * demo-login edge function.
 */
export function useIssueDemoLaunchLink() {
  return useMutation({
    mutationFn: async (memberId: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke<IssueResponse>(
        "demo-login",
        { body: { action: "issue", member_id: memberId } },
      );

      if (error || !data) {
        let message = "Couldn't create a launch link. Please try again.";
        if (error && "context" in error && error.context instanceof Response) {
          try {
            const body = await error.context.clone().json();
            if (typeof body?.error === "string") message = body.error;
          } catch {
            /* keep fallback */
          }
        }
        throw new Error(message);
      }

      return `${window.location.origin}/demo/launch#token=${encodeURIComponent(data.token)}`;
    },
  });
}
