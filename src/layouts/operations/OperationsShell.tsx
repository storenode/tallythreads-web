import { Outlet } from "react-router-dom";
import { OperationsHeader } from "./OperationsHeader";
import { OperationsTabBar } from "./OperationsTabBar";

/**
 * Store-floor chrome for /ops — header + bottom tab bar, deliberately no sidebar
 * (unlike ConsoleShell): this is meant for a counter tablet/phone during day-to-day
 * store operations, not a desktop back-office session.
 */
export default function OperationsShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <OperationsHeader />
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <OperationsTabBar />
    </div>
  );
}
