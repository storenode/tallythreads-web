import { Outlet } from "react-router-dom";
import { OperationsHeader } from "./OperationsHeader";
import { OperationsTabBar } from "./OperationsTabBar";
import { QuickMenu } from "@/features/quick-actions/QuickMenu";

/**
 * Store-floor chrome for /ops — header + bottom tab bar, deliberately no sidebar
 * (unlike ConsoleShell): this is meant for a counter tablet/phone during day-to-day
 * store operations, not a desktop back-office session.
 */
export default function OperationsShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-fg">
      <OperationsHeader />
      {/* pb-24: room so the floating quick-actions button never covers the end of a page. */}
      <main className="flex-1 overflow-y-auto px-4 pt-6 pb-24 sm:px-6">
        <Outlet />
      </main>
      <OperationsTabBar />
      <QuickMenu scope="store" aboveTabBar />
    </div>
  );
}
