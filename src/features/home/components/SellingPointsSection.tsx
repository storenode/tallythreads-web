import { Container } from "@/components/ui/Container";
import { sellingPoints } from "@/features/home/data/sellingPoints";

export function SellingPointsSection() {
  return (
    <section id="why-us" className="bg-surface py-20 sm:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            Why store owners choose TallyThreads
          </h2>
        </div>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {sellingPoints.map(({ icon: Icon, title, description }) => (
            <div key={title} className="text-center sm:text-left">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-tt-lavender-500/10 text-tt-lavender-600 sm:mx-0 dark:text-tt-lavender-500">
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
