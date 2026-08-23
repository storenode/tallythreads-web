import { Link, useNavigate } from "react-router-dom";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GoogleSignInButton } from "@/features/home/components/GoogleSignInButton";
import { useScrollY } from "@/hooks/useScrollY";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#why-us", label: "Why us" },
];

export function Navbar() {
  const scrollY = useScrollY();
  const navigate = useNavigate();
  const isScrolled = scrollY > (typeof window !== "undefined" ? window.innerHeight * 0.7 : 500);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        isScrolled
          ? "border-b border-border bg-bg/90 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" aria-label="TallyThreads home">
          <Logo size="sm" />
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          {navLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden sm:block">
            <Button variant="ghost" size="md" onClick={() => navigate("/login")}>
              Sign In
            </Button>
          </div>
          <div className="hidden sm:block">
            <GoogleSignInButton />
          </div>
        </div>
      </Container>
    </header>
  );
}
