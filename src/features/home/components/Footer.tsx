import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { socialLinks } from "@/features/home/data/socialLinks";

export function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <Container className="flex flex-col items-center justify-between gap-6 text-sm text-fg-muted sm:flex-row">
        <Logo size="sm" />

        <nav aria-label="TallyThreads on social media" className="flex items-center gap-1">
          {socialLinks.map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`TallyThreads on ${label}`}
              title={label}
              className="inline-flex size-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Icon className="size-5" />
            </a>
          ))}
        </nav>

        <p>&copy; {new Date().getFullYear()} TallyThreads. Cloth store operating system.</p>
      </Container>
    </footer>
  );
}
