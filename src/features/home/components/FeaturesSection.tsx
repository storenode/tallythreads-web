import { Container } from "@/components/ui/Container";
import { features } from "@/features/home/data/features";

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            Everything the shop needs, in one app
          </h2>
          <p className="mt-4 text-fg-muted">
            Not a generic POS with a garment skin — every screen is built around how a
            cloth store actually sources, stocks, and sells.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-tt-green-500/40"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-tt-green-500/10 text-tt-green-600 dark:text-tt-green-500">
                <Icon size={22} aria-hidden />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-fg">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                {description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
