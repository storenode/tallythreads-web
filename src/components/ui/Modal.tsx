import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** false → no ✕, no Escape, no backdrop click: the user must pick one of the dialog's buttons. */
  dismissible?: boolean;
  /** Panel width: "md" (default) or "xl" for wide content such as tables. */
  size?: "md" | "xl";
}

/** Minimal centered dialog, portaled to document.body so it isn't clipped by
 * ancestors like DataTable's `overflow-hidden` card. */
export function Modal({ open, onClose, title, children, dismissible = true, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open || !dismissible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-fg/40" onClick={dismissible ? onClose : undefined} aria-hidden />
      {/* Scrolls inside when taller than the screen (long member lists, tables). */}
      <div
        className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-lg ${
          size === "xl" ? "max-w-4xl" : "max-w-md"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-medium text-fg">{title}</h3>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-fg-muted hover:text-fg"
            >
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
