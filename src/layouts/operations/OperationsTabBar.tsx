import { NavLink } from "react-router-dom";
import { operationsNav } from "./nav";

/**
 * Bottom tab bar — the operations shell has no sidebar (unlike ConsoleShell); this
 * is its only navigation, sized for a thumb on a counter tablet/phone.
 */
export function OperationsTabBar() {
  return (
    <nav className="sticky bottom-0 z-20 flex shrink-0 border-t border-border bg-surface/95 backdrop-blur">
      {operationsNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
              isActive ? "text-brand-text-active" : "text-fg-muted hover:text-fg"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={`size-5 ${isActive ? "text-brand-text-active" : ""}`}
              />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
