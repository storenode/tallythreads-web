import { clearActiveMember } from "@/lib/memberSession";

/**
 * Clears only the *active* member's cached row/JWT — purely a local/offline clear.
 * Any other member cached on this shared device (see memberSession.ts) is untouched.
 */
export async function signOut() {
  await clearActiveMember();
}
