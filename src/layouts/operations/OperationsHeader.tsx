import { Logo } from "@/components/ui/Logo";
import { AreaSwitcher } from "@/features/auth/AreaSwitcher";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { StoreSwitcher } from "@/features/operations/StoreSwitcher";

/**
 * Operations shell's header — no sidebar to toggle here (see OperationsShell/
 * OperationsTabBar), just branding + store switcher + area switcher + account menu.
 */
export function OperationsHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
      <Logo size="sm" />
      <div className="ml-auto flex items-center gap-3">
        <StoreSwitcher />
        <AreaSwitcher />
        <AccountMenu />
      </div>
    </header>
  );
}
