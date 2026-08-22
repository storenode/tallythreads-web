import { useState } from "react";
import { signInWithGoogle } from "@/features/auth/signIn";

interface GoogleSignInButtonProps {
  className?: string;
  /**
   * Default is "Sign up with Google" — this button is the account-creation path
   * (M1a-identity-auth.md Task 3: Sign Up is Google-only). Pass "Sign in with
   * Google" where it's offered as a secondary option to an already-registered
   * user, e.g. on the unified /login page.
   */
  label?: string;
}

export function GoogleSignInButton({ className = "", label = "Sign up with Google" }: GoogleSignInButtonProps) {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await signInWithGoogle();
      // signInWithOAuth redirects the browser away — this component unmounts.
    } catch (err) {
      console.error("Google sign-in failed:", err);
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`inline-flex min-h-11 items-center justify-center gap-3 rounded-full border border-border bg-bg px-5 text-sm font-semibold text-fg shadow-sm transition-colors hover:bg-surface-2 disabled:opacity-60 ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z"
        />
      </svg>
      {isPending ? "Redirecting…" : label}
    </button>
  );
}
