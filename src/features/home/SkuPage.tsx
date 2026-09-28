import { Link, useParams } from "react-router-dom";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { ScanButton, SkuResult } from "@/features/inventory/BarcodeLookup";

/**
 * Public item page a label's QR code opens (/s/:sku): point any phone camera at a price tag and
 * see the item — no app, no sign-in. Same read-only details as the header Scan button.
 */
export default function SkuPage() {
  const { sku = "" } = useParams<{ sku: string }>();
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Container className="flex h-14 items-center justify-between">
          <Link to="/" aria-label="TallyThreads home">
            <Logo size="sm" />
          </Link>
          <ScanButton />
        </Container>
      </header>
      <main>
        <Container className="py-6">
          <div className="mx-auto max-w-md">
            <SkuResult raw={sku} />
          </div>
        </Container>
      </main>
    </div>
  );
}
