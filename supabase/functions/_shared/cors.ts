// Shared CORS setup for M1a's auth Edge Functions (mint-member-session, set-pin,
// verify-pin). Edge Functions don't add CORS headers automatically — the browser
// calls these cross-origin, and without these every request is blocked at the
// preflight stage before the function code even runs. Wide open (`*`) for now;
// narrowing to the real app origin(s) is worth doing before this goes to real users.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // x-client-info and x-supabase-api-version are added automatically by
  // supabase-js's functions.invoke() — missing either here fails preflight.
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}
