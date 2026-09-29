import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { formatInr, rupeesToPaise } from "@/lib/money";
import { ChatPanel } from "./ChatPanel";

/**
 * Chat-window style panels opened from the floating quick-actions button:
 * - **Quick expense** — UI preview for the Shift & Store Operations Log (M10,
 *   specs/roadmap/shift-store-ops-log.md); nothing is saved yet (said on screen).
 * - **Chat** — team chat within the organization (ChatPanel); a preview, nothing is sent yet.
 */

export type QuickView = "expense" | "chat";

/** The panel shell: anchored above the floating button, scrolls inside, closes with ✕. */
export function QuickPanel({
  view,
  scope,
  onClose,
}: {
  view: QuickView;
  scope: "store" | "org";
  onClose: () => void;
}) {
  if (view === "chat") return <ChatPanel scope={scope} onClose={onClose} />;
  const title = "Quick expense";
  return (
    <section
      role="dialog"
      aria-label={title}
      className="absolute right-0 bottom-full mb-3 flex max-h-[min(70dvh,34rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="text-xs text-fg-muted">{scope === "org" ? "Organization" : "This store"}</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <X size={18} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <QuickExpenseForm scope={scope} />
      </div>
    </section>
  );
}

// ── quick expense form ─────────────────────────────────────────────────────────────────────

const CATEGORIES = ["Tea / coffee", "Water can", "Pooja items", "Cleaning", "Transport", "Other"];

function QuickExpenseForm({ scope }: { scope: "store" | "org" }) {
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState<{ category: string; paise: number } | null>(null);
  const paise = rupeesToPaise(amount);
  const valid = !!category && paise != null && paise > 0 && (category !== "Other" || note.trim() !== "");

  if (submitted) {
    return (
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-success-text">
          <CheckCircle2 size={18} /> {submitted.category} · {formatInr(submitted.paise)}
        </p>
        <p className="text-fg-muted">
          Preview only — expenses aren&apos;t saved yet. When this is built, it goes to the
          {scope === "org" ? " organization's records" : " owner / manager for approval"}.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setSubmitted(null);
            setCategory(null);
            setAmount("");
            setNote("");
          }}
        >
          Add another
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setSubmitted({ category: category!, paise: paise! });
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg-muted">What for?</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "min-h-11 rounded-full border px-3 text-sm",
                category === c
                  ? "border-brand bg-brand-subtle-bg font-medium text-brand"
                  : "border-border text-fg hover:bg-surface-2",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>
      <Input
        label="Amount (₹)"
        type="number"
        inputMode="decimal"
        placeholder="e.g. 60"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Input
        label={category === "Other" ? "What was it?" : "Note (optional)"}
        placeholder="e.g. 6 teas for the team"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={120}
      />
      <p className="text-xs text-fg-muted">Today · paid from the counter cash</p>
      <Button type="submit" className="w-full" disabled={!valid}>
        {scope === "org" ? "Save expense" : "Submit for approval"}
      </Button>
      <p className="text-center text-xs text-fg-muted">Preview — not saved yet</p>
    </form>
  );
}
