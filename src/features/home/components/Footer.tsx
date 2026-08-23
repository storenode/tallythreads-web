import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";

export function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <Container className="flex flex-col items-center justify-between gap-4 text-sm text-fg-muted sm:flex-row">
        <Logo size="sm" />
        <p>&copy; {new Date().getFullYear()} TallyThreads. Cloth store operating system.</p>
      </Container>
    </footer>
  );
}
