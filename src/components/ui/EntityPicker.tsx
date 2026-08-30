import { Link } from "react-router-dom";

export interface EntityPickerItem {
  id: string;
  title: string;
  subtitle?: string;
  to: string;
}

interface EntityPickerProps {
  items: EntityPickerItem[];
}

/**
 * A simple list of cards for "you're tagged to more than one of these, pick one"
 * screens — shared by the org picker (/org) and store picker (/ops) rather than
 * building two near-identical UIs.
 */
export function EntityPicker({ items }: EntityPickerProps) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.to}
          className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-tt-green-500/50 hover:bg-surface-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{item.title}</p>
            {item.subtitle && (
              <p className="truncate text-xs text-fg-muted">{item.subtitle}</p>
            )}
          </div>
          <span className="shrink-0 text-fg-muted">→</span>
        </Link>
      ))}
    </div>
  );
}
