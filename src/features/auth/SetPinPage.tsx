import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { Button } from "@/components/ui/Button";
import { useMember } from "@/features/auth/useMember";
import { resolvePostSignInPath } from "@/features/auth/resolvePostSignInPath";

const PIN_PATTERN = /^\d{4,6}$/;

/**
 * Shown right after every Google sign-in on a device — first-ever or repeat. The PIN
 * is per (device_id, member_id), so this always sets a *new* PIN for this device, it
 * never inherits one from another device the member has enrolled elsewhere. See
 * specs/tasks/M1a-identity-auth.md Task 2, subtask 6.
 */
export default function SetPinPage() {
  const navigate = useNavigate();
  const { member, isLoading, isSignedIn } = useMember();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return null;
  if (!isSignedIn) return <Navigate to="/" replace />;

  // Live feedback as the user types, not just on submit — only once they've typed at
  // least as many digits into "confirm" as "PIN" has, so it doesn't flash red while
  // they're still partway through re-entering a correct match.
  const liveMismatch =
    confirmPin.length > 0 && confirmPin.length >= pin.length && pin !== confirmPin;
  const isFormValid = PIN_PATTERN.test(pin) && pin === confirmPin;

  function handlePinChange(value: string) {
    setPin(value.replace(/\D/g, "").slice(0, 6));
    setError(null);
  }

  function handleConfirmPinChange(value: string) {
    setConfirmPin(value.replace(/\D/g, "").slice(0, 6));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!PIN_PATTERN.test(pin)) {
      setError("PIN must be 4 to 6 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }

    setIsSubmitting(true);
    const { error: fnError } = await supabase.functions.invoke("set-pin", {
      body: { device_id: getDeviceId(), pin },
    });

    if (fnError) {
      setIsSubmitting(false);
      setError("Couldn't set your PIN. Please try again.");
      return;
    }

    const destination = member ? await resolvePostSignInPath(member.id) : "/no-store";
    setIsSubmitting(false);
    navigate(destination, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface-2 p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-fg">Create a PIN for this device</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {member?.first_name ? `Hi ${member.first_name}, s` : "S"}et a 4-to-6-digit
            PIN so you can sign back in on this device without Google every time. This
            PIN only works on this device and expires in 30 days.
          </p>
        </div>
        <div className="space-y-2">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="New PIN"
            value={pin}
            onChange={(e) => handlePinChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-fg outline-none focus:border-tt-green-500"
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Confirm PIN"
            value={confirmPin}
            onChange={(e) => handleConfirmPinChange(e.target.value)}
            aria-invalid={liveMismatch}
            className={`w-full rounded-lg border bg-bg px-4 py-3 text-fg outline-none focus:border-tt-green-500 ${
              liveMismatch ? "border-red-500" : "border-border"
            }`}
          />
        </div>
        {liveMismatch && !error && <p className="text-sm text-red-500">PINs don't match.</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={isSubmitting || !isFormValid} className="w-full">
          {isSubmitting ? "Saving…" : "Save PIN"}
        </Button>
      </form>
    </div>
  );
}
