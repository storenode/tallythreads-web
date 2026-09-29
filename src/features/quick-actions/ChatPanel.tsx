import { Fragment, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AtSign, SendHorizontal, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMyStores } from "@/features/operations/myStores";
import { useStoresByOrg } from "@/features/stores/stores";

/**
 * Team chat for the people of ONE organization (founder, 2026-09-28) — e.g. the org admin, the
 * sales person at Store A and the one at Store B. One chat window (no conversation list); to
 * address someone, type "@" (Teams-style) or "/" in the message box and pick them — the message
 * carries an @mention. Never across organizations.
 * STATIC UI PREVIEW: people are shown by role + the org's real store names, the earlier messages
 * are samples and nothing is sent (said on screen). Real chat needs a spec + migration (messages
 * with RLS by org, mentions, Supabase Realtime) — not built yet.
 */

type Message = { id: string; from: string; mine: boolean; text: string; time: string; pending?: boolean };

/** "@" or "/" starting a word, followed by what's typed so far (the filter). */
const TRIGGER = /(^|\s)[@/]([^\s@/]*)$/;

export function ChatPanel({ scope, onClose }: { scope: "store" | "org"; onClose: () => void }) {
  const { orgId: orgParam, storeId } = useParams<{ orgId?: string; storeId?: string }>();
  const { data: myStores } = useMyStores(scope === "store" && storeId ? [storeId] : []);
  const here = myStores?.[0];
  const orgId = scope === "org" ? orgParam : here?.organizationId;
  const { data: stores } = useStoresByOrg(orgId);

  // Who "I" am in the sample: the org admin in the org console, the store's sales person in ops.
  const me = scope === "org" ? "Org admin" : `Sales · ${here?.name ?? "this store"}`;
  const people = [
    { name: "Org admin", role: "Owner / manager" },
    ...(stores ?? []).map((s) => ({ name: `Sales · ${s.name}`, role: `Sales person at ${s.name}` })),
  ].filter((p) => p.name !== me);
  const otherSales = people.find((p) => p.name.startsWith("Sales · "))?.name ?? "Sales · Store B";

  const [sent, setSent] = useState<Message[]>([]);
  const messages: Message[] = [
    { id: "s1", from: "Org admin", mine: scope === "org", text: "New stock reaches the stores this week. Plan the front display 🙏", time: "9:10" },
    { id: "s2", from: otherSales, mine: false, text: "@Org admin 3 boxes arrived, 1 short — checking the LR.", time: "11:02" },
    { id: "s3", from: "Org admin", mine: scope === "org", text: `@${otherSales} please share the LR photo, I'll follow up with the transporter.`, time: "11:15" },
    ...sent,
  ];
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mention picker: open while the word being typed starts with "@" or "/".
  const match = draft.match(TRIGGER);
  const query = match?.[2].toLowerCase() ?? "";
  const options = match ? people.filter((p) => p.name.toLowerCase().includes(query)) : [];
  const picking = !!match && options.length > 0;

  const pick = (name: string) => {
    setDraft((d) => d.replace(TRIGGER, (_all, lead: string) => `${lead}@${name} `));
    setActive(0);
    inputRef.current?.focus();
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setSent((m) => [...m, { id: `local-${m.length}`, from: me, mine: true, text, time, pending: true }]);
    setDraft("");
  };

  /** Show "@Name" mentions of known people as highlighted chips inside a bubble. */
  const renderText = (text: string, mine: boolean) => {
    const names = [...people.map((p) => p.name), me].sort((a, b) => b.length - a.length);
    const parts: (string | { mention: string })[] = [];
    let rest = text;
    while (rest) {
      const at = rest.indexOf("@");
      if (at < 0) break;
      const hit = names.find((n) => rest.startsWith(`@${n}`, at));
      if (!hit) {
        parts.push(rest.slice(0, at + 1));
        rest = rest.slice(at + 1);
        continue;
      }
      if (at) parts.push(rest.slice(0, at));
      parts.push({ mention: hit });
      rest = rest.slice(at + 1 + hit.length);
    }
    if (rest) parts.push(rest);
    return parts.map((p, i) =>
      typeof p === "string" ? (
        <Fragment key={i}>{p}</Fragment>
      ) : (
        <span
          key={i}
          className={cn("rounded px-1 font-medium", mine ? "bg-white/20" : "bg-brand-subtle-bg text-brand")}
        >
          @{p.mention}
        </span>
      ),
    );
  };

  return (
    <section
      role="dialog"
      aria-label="Chat"
      className="absolute right-0 bottom-full mb-3 flex h-[min(75dvh,36rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
    >
      <header className="flex items-center gap-2 border-b border-border py-2 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-fg">Chat</h2>
          <p className="truncate text-xs text-fg-muted">You: {me} · type @ to mention someone</p>
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

      <p className="border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-fg-muted">
        Preview — sample messages; nothing is sent yet.
      </p>

      <ol className="flex flex-1 flex-col gap-2 overflow-y-auto p-3" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className={cn("flex max-w-[85%] flex-col", m.mine ? "items-end self-end" : "items-start")}>
            {!m.mine && <span className="mb-0.5 px-1 text-[11px] text-fg-muted">{m.from}</span>}
            <span
              className={cn(
                "rounded-2xl px-3 py-2 text-sm",
                m.mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-surface-2 text-fg",
              )}
            >
              {renderText(m.text, m.mine)}
            </span>
            <span className="mt-0.5 px-1 text-[11px] text-fg-muted">
              {m.time}
              {m.pending && " · not sent (preview)"}
            </span>
          </li>
        ))}
      </ol>

      <form
        className="relative flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (picking) pick(options[Math.min(active, options.length - 1)].name);
          else send();
        }}
      >
        {picking && (
          <ul
            role="listbox"
            aria-label="Mention someone"
            className="absolute right-2 bottom-full left-2 mb-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            {options.map((p, i) => (
              <li key={p.name} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // mousedown (not click) so the input keeps focus.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(p.name);
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm",
                    i === active ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <UserRound size={16} className="shrink-0 text-fg-muted" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{p.name}</span>
                    <span className="block truncate text-xs text-fg-muted">{p.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          aria-label="Mention someone"
          onClick={() => {
            setDraft((d) => (d && !d.endsWith(" ") ? `${d} @` : `${d}@`));
            inputRef.current?.focus();
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <AtSign size={18} />
        </button>
        {/* 16px text on phones so iOS doesn't zoom on focus (constitution §6). */}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!picking) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + options.length) % options.length);
            } else if (e.key === "Escape") {
              // Close the picker, not the whole panel.
              e.stopPropagation();
              setDraft((d) => d.replace(TRIGGER, (all) => `${all} `));
            }
          }}
          placeholder="Message… (type @ to mention)"
          aria-label="Message"
          role="combobox"
          aria-expanded={picking}
          aria-autocomplete="list"
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-transparent px-4 text-[16px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-hidden sm:text-sm"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim()}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-50"
        >
          <SendHorizontal size={18} />
        </button>
      </form>
    </section>
  );
}
