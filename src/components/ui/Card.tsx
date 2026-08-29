import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  desc?: ReactNode;
  /** Trailing content (e.g. buttons) rendered to the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({
  title,
  desc,
  actions,
  children,
  className = "",
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface ${className}`}
    >
      {title && (
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-medium text-fg">{title}</h3>
            {actions}
          </div>
          {desc && <p className="mt-1 text-sm text-fg-muted">{desc}</p>}
        </div>
      )}

      <div
        className={
          title
            ? "border-t border-border p-5 sm:p-6"
            : "p-5 sm:p-6"
        }
      >
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}
