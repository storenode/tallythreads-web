import { useEffect, useRef, useState } from "react";
import { LayoutGrid, MessagesSquare, Receipt, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { QuickPanel, type QuickView } from "./QuickPanel";

/**
 * Floating quick-actions button, bottom-right on every organization (console) and store
 * (operations) page — not the platform admin. Two actions, each opening a chat-window style
 * panel above the button (QuickPanel):
 * - **Expenses** — log a quick petty spend (tea, water can, pooja items…) — M10 preview.
 * - **Chat** — talk to the organization / stores / people of this org — preview.
 * The menu opens upward on hover (mouse) and on tap / Enter (touch, keyboard); Escape or a click
 * outside closes. `aboveTabBar` lifts it over the operations bottom tab bar.
 */
const ITEMS: Record<"store" | "org", { view: QuickView; icon: typeof Receipt; label: string; hint: string }[]> = {
  store: [
    { view: "expense", icon: Receipt, label: "Expenses", hint: "Log a quick spend — tea, water can, pooja items…" },
    { view: "chat", icon: MessagesSquare, label: "Chat", hint: "Message the organization and other stores" },
  ],
  org: [
    { view: "expense", icon: Receipt, label: "Expenses", hint: "Log an organization expense" },
    { view: "chat", icon: MessagesSquare, label: "Chat", hint: "Message your stores and team" },
  ],
};

export function QuickMenu({ scope, aboveTabBar = false }: { scope: "store" | "org"; aboveTabBar?: boolean }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<QuickView | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !view) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setView(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setView(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, view]);

  return (
    <div
      ref={ref}
      // z-20: over page content, under the mobile sidebar overlay (z-30) and dialogs (z-50).
      className={cn(
        "fixed right-[calc(1rem+env(safe-area-inset-right))] z-20",
        aboveTabBar
          ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]"
          : "bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
      )}
      // Hover shows the menu — but not while a panel is open (it would cover it).
      onMouseEnter={() => !view && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Quick actions: expenses and chat"
        aria-haspopup="menu"
        aria-expanded={open || !!view}
        onClick={() => {
          if (view) setView(null);
          else setOpen((o) => !o);
        }}
        className="inline-flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-lg ring-4 ring-bg transition-transform hover:scale-105"
      >
        {view ? <X className="size-5" /> : <LayoutGrid className="size-5" />}
      </button>
      {view && <QuickPanel view={view} scope={scope} onClose={() => setView(null)} />}
      {open && !view && (
        // Opens upward; pb-2 (not mb-2) keeps the hover area continuous down to the button.
        <div className="absolute right-0 bottom-full w-64 pb-2">
          <div role="menu" className="overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            {ITEMS[scope].map(({ view: v, icon: Icon, label, hint }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setView(v);
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm not-last:border-b not-last:border-border hover:bg-surface-2"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">{label}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
