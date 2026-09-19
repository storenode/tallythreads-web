import { PageHeading } from "@/components/ui/PageHeading";

/**
 * Admin dashboard. The organizations directory now lives under its own nav
 * item, so this is an empty placeholder for future platform-wide stats /
 * overview widgets.
 */
export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <PageHeading>Dashboard</PageHeading>

      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm text-fg-muted">Nothing here yet.</p>
      </div>
    </div>
  );
}
