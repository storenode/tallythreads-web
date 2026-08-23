import { useScrollY } from "@/hooks/useScrollY";

/**
 * Layered parallax backdrop for the hero — an abstract take on the storefront
 * awning (the "parda"/curtain motif from the brand mark), not a literal photo.
 * Each layer moves at a different rate off scrollY for depth.
 */
export function HeroBackground() {
  const scrollY = useScrollY();

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 bg-gradient-to-b from-parda-lavender-50 via-surface to-surface dark:from-parda-lavender-700/20 dark:via-surface dark:to-surface"
        style={{ transform: `translateY(${scrollY * 0.15}px)` }}
      />

      <div
        className="absolute -top-24 -left-24 size-96 rounded-full bg-parda-green-500/20 blur-3xl"
        style={{ transform: `translateY(${scrollY * 0.35}px)` }}
      />
      <div
        className="absolute top-10 -right-32 size-[28rem] rounded-full bg-parda-lavender-500/20 blur-3xl"
        style={{ transform: `translateY(${scrollY * 0.25}px)` }}
      />

      <svg
        className="absolute inset-x-0 bottom-0 w-full text-parda-lavender-500/10"
        style={{ transform: `translateY(${scrollY * 0.5}px)` }}
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={i}
            d={`M${i * 100} 40 h100 v50 a50 30 0 0 1 -100 0 z`}
            fill={i % 2 === 0 ? "#2FBF71" : "#7B7FE0"}
            opacity="0.12"
          />
        ))}
      </svg>
    </div>
  );
}
