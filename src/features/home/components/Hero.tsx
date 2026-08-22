import { useNavigate } from "react-router-dom";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/features/home/components/GoogleSignInButton";
import { HeroBackground } from "@/features/home/components/HeroBackground";

export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative flex min-h-[90vh] items-center pt-24">
      <HeroBackground />
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <img
            src="/logo-mark.svg"
            alt="StoreParda"
            className="mx-auto mb-6 size-20 drop-shadow-[0_8px_24px_rgba(47,191,113,0.25)] sm:size-24"
          />
          <p className="mb-4 inline-flex items-center rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Cloth store operating system
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl md:text-6xl">
            Run your cloth store from{" "}
            <span className="text-parda-green-500">billing</span> to{" "}
            <span className="text-parda-lavender-500">sourcing trips</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-fg-muted">
            StoreParda tracks landed cost from the moment you buy stock in Surat or
            Kerala to the moment it's billed at the counter — offline-first, built for
            independent Indian cloth stores.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <GoogleSignInButton />
            <Button variant="ghost" size="md" onClick={() => navigate("/login")}>
              Sign In
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() =>
                document
                  .getElementById("features")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See features
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
