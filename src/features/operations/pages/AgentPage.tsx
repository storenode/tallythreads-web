import { Bot, ScanBarcode } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";

/**
 * Store Agent (`/ops/:storeId/agent`) — placeholder. The Assistant is designed, not built
 * (specs/roadmap/assistant.md): a Claude tool-use loop over price-free stock lookups.
 */
export default function AgentPage() {
  return (
    <div className="space-y-6">
      <PageHeading>Agent</PageHeading>
      <Card>
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 size-6 shrink-0 text-fg-muted" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-fg">Coming soon</p>
            <p className="text-fg-muted">
              Ask about stock in plain words — &ldquo;Is this red saree in size M at any of our stores?&rdquo;
              — and get the answer store by store.
            </p>
            <p className="flex items-center gap-1.5 text-fg-muted">
              For now, tap <ScanBarcode className="inline size-4" /> in the header to look up any label.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
