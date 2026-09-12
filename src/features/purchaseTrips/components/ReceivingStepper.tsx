import { Fragment } from "react";
import {
  RECEIVING_STAGES,
  RECEIVING_LABEL,
  type ReceivingStatus,
} from "../receiving";

/**
 * Horizontal progress stepper for a parcel's receiving journey:
 * In transit → Received → Verified → Approved. Purely presentational — completed steps are
 * filled, the current step highlighted, future steps muted. No stepper library exists in the
 * repo, so this is hand-rolled with the shared color tokens.
 */
export function ReceivingStepper({ status }: { status: ReceivingStatus }) {
  const currentIndex = RECEIVING_STAGES.indexOf(status);

  return (
    <ol className="flex items-center">
      {RECEIVING_STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const circle = done
          ? "border-tt-green-500 bg-tt-green-500 text-white"
          : current
            ? "border-brand bg-brand/10 text-brand"
            : "border-border bg-bg text-fg-muted";
        return (
          <Fragment key={stage}>
            <li className="flex flex-col items-center gap-1">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${circle}`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-xs ${current ? "font-medium text-fg" : "text-fg-muted"}`}
              >
                {RECEIVING_LABEL[stage]}
              </span>
            </li>
            {i < RECEIVING_STAGES.length - 1 && (
              <span
                className={`mx-2 mb-5 h-0.5 flex-1 ${i < currentIndex ? "bg-tt-green-500" : "bg-border"}`}
              />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
