import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import {
  SETUP_STEPS,
  setupStepIndex,
  setupStepPath,
  type SetupArea,
  type SetupStepKey,
} from "./steps";

/**
 * Full-width horizontal progress stepper for the setup wizard. Each step is a
 * numbered/iconed circle joined by a connector line.
 *
 * Every circle uses the same active/success green — full opacity on the
 * current step, dimmed on the rest — in both create ("new org") and edit modes,
 * so the wizard reads as one consistent green progress bar throughout.
 *
 * Navigation: when `orgId` is set (the org already exists) every step is a link
 * to its route, so an admin can jump between steps freely, each brightening on
 * hover as a "clickable" affordance. In create mode (`orgId` null — the org
 * doesn't exist yet) the circles render the same but are inert, since no other
 * step is reachable until the org is created.
 *
 * Responsive: on `sm+` every circle carries its text label underneath; on
 * mobile the labels are hidden and only the icons show, so four steps still fit
 * a phone width without wrapping.
 */
export function SetupStepper({
  currentKey,
  orgId,
  area = "admin",
  completed,
}: {
  currentKey: SetupStepKey;
  orgId: string | null;
  area?: SetupArea;
  completed?: Record<SetupStepKey, boolean>;
}) {
  const currentIndex = setupStepIndex(currentKey);

  return (
    <ol className="flex w-full items-start">
      {SETUP_STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = completed?.[step.key] ?? index < currentIndex;
        const Icon = isDone && !isCurrent ? Check : step.icon;
        const isLast = index === SETUP_STEPS.length - 1;

        const circle = (
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-success-text bg-success-text text-white transition-opacity ${
              isCurrent ? "opacity-100" : "opacity-40 group-hover:opacity-70"
            }`}
          >
            <Icon aria-hidden className="size-5" strokeWidth={2} />
          </span>
        );

        const label = (
          <span
            className={`mt-2 hidden text-xs font-medium whitespace-nowrap text-success-text transition-opacity sm:block ${
              isCurrent ? "opacity-100" : "opacity-40 group-hover:opacity-70"
            }`}
          >
            {step.label}
          </span>
        );

        const inner = (
          <span className="flex flex-col items-center">
            {circle}
            {label}
          </span>
        );

        return (
          <li
            key={step.key}
            className={`flex items-center ${isLast ? "" : "flex-1"}`}
          >
            {orgId ? (
              <Link
                to={setupStepPath(area, orgId, step.key)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={step.label}
                className="group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {inner}
              </Link>
            ) : (
              <span aria-current={isCurrent ? "step" : undefined}>{inner}</span>
            )}

            {!isLast && (
              <span
                aria-hidden
                className="mx-2 mt-5 h-0.5 flex-1 self-start rounded-full bg-success-text opacity-40"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
