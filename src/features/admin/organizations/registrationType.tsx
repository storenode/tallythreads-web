import type { RegistrationType } from "./organizations";

/**
 * Single source of truth for how each organization registration type is
 * labelled and colored across the app (dashboard cards, org list, org form,
 * anywhere else it shows up). Add new registration types here only —
 * never hardcode a label/color pair at a call site.
 */
export const REGISTRATION_TYPE_META: Record<
  RegistrationType,
  { label: string; textClass: string; bgClass: string }
> = {
  independent: {
    label: "Individual",
    textClass: "text-brand-text-active",
    bgClass: "bg-brand-subtle-bg",
  },
  chain: {
    label: "Chain",
    textClass: "text-success-text",
    bgClass: "bg-success-bg",
  },
  franchise: {
    label: "Franchise",
    textClass: "text-warning-text",
    bgClass: "bg-warning-bg",
  },
};

export function RegistrationTypeBadge({
  type,
}: {
  type: RegistrationType | null;
}) {
  if (!type) return null;
  const meta = REGISTRATION_TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.bgClass} ${meta.textClass}`}
    >
      {meta.label}
    </span>
  );
}
