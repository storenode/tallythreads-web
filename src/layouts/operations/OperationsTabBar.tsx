import { NavLink, useParams } from "react-router-dom";
import { getOperationsNav } from "./nav";

/**
 * Bottom tab bar — the operations shell has no sidebar (unlike ConsoleShell); this
 * is its only navigation, sized for a thumb on a counter tablet/phone. Reads the
 * current :storeId itself (rather than taking it as a prop) since it's always
 * rendered inside the /ops/:storeId route tree.
 */
export function OperationsTabBar() {
  const { storeId } = useParams<{ storeId: string }>();
  const nav = getOperationsNav(storeId ?? "");

  return (
    <nav className="sticky bottom-0 z-20 flex shrink-0 border-t border-border bg-surface/95 backdrop-blur">
      {nav.map((item) => (
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
