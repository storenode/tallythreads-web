/**
 * Minimal class-name joiner. The project has no `clsx`/`tailwind-merge`, and the
 * tab component only ever concatenates static Tailwind strings with a couple of
 * conditionals — no conflicting-utility resolution needed — so a plain
 * join-and-filter is enough.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
