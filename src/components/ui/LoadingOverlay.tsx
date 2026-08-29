import { Spinner } from "./Spinner";

interface LoadingOverlayProps {
  show: boolean;
  scope: "page" | "card";
  label?: string;
}

export function LoadingOverlay({
  show,
  scope,
  label = "Loading…",
}: LoadingOverlayProps) {
  if (!show) return null;
  const positionClass =
    scope === "page" ? "fixed inset-0 z-50" : "absolute inset-0 z-10";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`${positionClass} flex items-center justify-center bg-fg/40 backdrop-blur-[1px]`}
    >
      <div className="flex flex-col items-center gap-2 rounded-xl bg-surface px-5 py-4 shadow-lg">
        <Spinner size={24} />
        <span className="text-xs font-medium text-fg-muted">{label}</span>
      </div>
    </div>
  );
}
