import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut } from "lucide-react";
import { useMember } from "@/features/auth/useMember";
import { signOut } from "@/features/auth/signOut";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

// Unlike AppShell (bottom tab bar, mobile-first store screens), platform admin isn't
// scoped to a store at all — a left sidenav fits its desktop-first, growing set of
// sections (organizations, staff, content moderation, etc. as they're built) better
// than a fixed 5-tab row. Only one placeholder section exists today.
const sections = [
  {
    to: "/admin",
    label: "Organizations",
    Icon: LayoutDashboard,
  },
];

export function AdminShell() {
  const { member } = useMember();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="flex h-full min-w-[320px] text-fg">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-2">
        <div className="border-b border-border px-4 py-4">
          <Logo size="sm" />
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {sections.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-parda-green-500/10 text-parda-green-600"
                    : "text-fg-muted hover:bg-bg hover:text-fg"
                }`
              }
            >
              <Icon size={18} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-bg">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {member?.avatar_url && (
              <img
                src={member.avatar_url}
                alt=""
                className="size-8 shrink-0 rounded-full"
              />
            )}
            <span className="truncate text-sm font-medium text-fg">
              {member
                ? [member.first_name, member.last_name]
                    .filter(Boolean)
                    .join(" ") || member.google_email
                : ""}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <LogOut size={18} aria-hidden />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-surface-2 p-4">
          <div className="rounded-2xl border border-border bg-bg p-4 shadow-sm">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
