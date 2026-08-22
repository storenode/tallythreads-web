/**
 * "Remember me" on the PIN login form — purely a client-side convenience that
 * persists the last-used email on this device so returning staff don't retype it.
 * Deliberately unrelated to session/JWT/PIN expiry (those stay a fixed 30 days) —
 * this only ever prefills a form field. See specs/tasks/M1a-identity-auth.md Task 3.
 */

const STORAGE_KEY = "sp_remembered_email";

export function getRememberedEmail(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setRememberedEmail(email: string): void {
  localStorage.setItem(STORAGE_KEY, email);
}

export function clearRememberedEmail(): void {
  localStorage.removeItem(STORAGE_KEY);
}
