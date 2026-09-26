/**
 * E2E environment. Values come from the shell or `.env.local` / `.env` (loaded by
 * playwright.config.ts). The suite runs against the LIVE Supabase project and only ever
 * creates `is_demo = true` organizations, which it hard-deletes after each test.
 */

export interface E2EEnv {
  supabaseUrl: string;
  anonKey: string;
  /** A platform admin's TallyThreads session JWT — see e2e/README.md for how to get it. */
  adminJwt: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env.local (or the shell) — see e2e/README.md.`,
    );
  }
  return value;
}

export function readEnv(): E2EEnv {
  return {
    supabaseUrl: required("VITE_SUPABASE_URL").replace(/\/$/, ""),
    anonKey: required("VITE_SUPABASE_ANON_KEY"),
    adminJwt: required("E2E_ADMIN_JWT"),
  };
}

/** Decodes a JWT payload without verifying it (the server verifies; we only read `sub`/`exp`). */
export function jwtPayload(jwt: string): { sub?: string; exp?: number } {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("E2E_ADMIN_JWT is not a JWT");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** Unique, human-readable tag for names/emails created by one test run. */
export function runTag(): string {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14);
  return `${stamp}${Math.random().toString(36).slice(2, 6)}`;
}
