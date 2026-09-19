import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useSetupNav } from "../SetupWizardLayout";
import type { SetupStepKey } from "../steps";

/**
 * Consistent Back / Next footer shared by the wizard's per-org steps. `back`
 * and `next` are step keys (or null at the ends; `next: "finish"` exits the
 * wizard). Paths come from the area-aware {@link useSetupNav}, so the footer
 * works in both the admin and org consoles. When a step has its own primary
 * save action, pass `nextLabel="Skip"` so Next reads as an optional skip.
 */
export function SetupStepFooter({
  back,
  next,
  nextLabel = "Next",
  onNext,
}: {
  back: SetupStepKey | null;
  next: SetupStepKey | "finish" | null;
  nextLabel?: string;
  onNext?: () => void;
}) {
  const navigate = useNavigate();
  const { stepPath, exitTo } = useSetupNav();

  const goNext = () => {
    if (onNext) return onNext();
    if (next === "finish") return navigate(exitTo);
    if (next) return navigate(stepPath(next));
  };

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <Button
        type="button"
        variant="ghost"
        disabled={!back}
        onClick={() => back && navigate(stepPath(back))}
      >
        ← Back
      </Button>
      <Button type="button" onClick={goNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
