import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { useMember } from "@/features/auth/useMember";
import type { TripRouteLeg } from "@/db/purchaseTrips";
import { createPurchaseTrip } from "../data";
import { RouteLegsTable } from "../components/RouteLegsTable";
import { CartWalletSummary } from "../components/CartWalletSummary";
import {
  legsPriceTotalPaise,
  legsPurchaseTotalPaise,
  areLegsValid,
} from "../legs";
import { forecastTrip } from "@/lib/tripForecast";
import { formatInr, rupeesToPaise } from "@/lib/money";

const schema = z.object({
  title: z.string().trim().min(1, "Trip title is required"),
  start_date: z.string(),
  end_date: z.string(),
  planned_budget: z.string(),
  estimated_expenses: z.string(),
  expected_margin: z.string(),
  notes: z.string(),
});
type Values = z.infer<typeof schema>;

export default function PurchaseTripCreatePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { member } = useMember();
  const [serverError, setServerError] = useState<string | null>(null);
  const [legErrors, setLegErrors] = useState(false);
  const [legs, setLegs] = useState<TripRouteLeg[]>([]);
  const listTo = `/org/${orgId}/purchase-trips`;

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: {
      title: "",
      start_date: "",
      end_date: "",
      planned_budget: "",
      estimated_expenses: "",
      expected_margin: "",
      notes: "",
    },
  });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  // Estimated expenses: the manual field wins; otherwise fall back to the legs' travel sum.
  const legsTravelPaise = legsPriceTotalPaise(legs);
  const manualExpensesPaise = rupeesToPaise(watch("estimated_expenses"));
  const effectiveExpensesPaise = manualExpensesPaise ?? legsTravelPaise;

  const budgetPaise = rupeesToPaise(watch("planned_budget"));
  const marginRaw = Number(watch("expected_margin"));
  const marginPct =
    Number.isFinite(marginRaw) && marginRaw >= 0 ? marginRaw / 100 : null;
  const forecast =
    budgetPaise != null && marginPct != null
      ? forecastTrip({
          plannedBudgetPaise: budgetPaise,
          estimatedExpensesPaise: effectiveExpensesPaise,
          expectedMarginPct: marginPct,
        })
      : null;

  if (!orgId) return null;

  const onSubmit = async (v: Values) => {
    setServerError(null);
    if (!member?.id) {
      setServerError(
        "No signed-in member — cannot record who created the trip.",
      );
      return;
    }
    if (!areLegsValid(legs)) {
      setLegErrors(true);
      setServerError(
        "Each leg needs From, To, and Distance (km) — open Verify on map to read the distance.",
      );
      return;
    }
    try {
      const trip = await createPurchaseTrip({
        organization_id: orgId,
        created_by: member.id,
        title: v.title.trim(),
        status: "planning",
        start_date: v.start_date || null,
        end_date: v.end_date || null,
        route: legs.length ? legs : null,
        planned_budget_paise: budgetPaise,
        estimated_expenses_paise:
          manualExpensesPaise ?? (legsTravelPaise > 0 ? legsTravelPaise : null),
        expense_estimate_source:
          manualExpensesPaise != null || legsTravelPaise > 0 ? "manual" : null,
        expected_margin_pct: marginPct,
        notes: v.notes.trim() || null,
      });
      navigate(`${listTo}/${trip._localId}`);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Couldn't create the trip.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={listTo}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        New purchase trip
      </PageHeading>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card
          title="Plan"
          actions={
            <CartWalletSummary
              cartPaise={legsPurchaseTotalPaise(legs)}
              budgetPaise={budgetPaise}
              expensesPaise={effectiveExpensesPaise}
            />
          }
        >
          <div className="space-y-4">
            <Input
              label="Trip title"
              placeholder="Surat — Aug 2026"
              error={errors.title?.message}
              {...register("title")}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start date"
                type="date"
                {...register("start_date")}
              />
              <Input label="End date" type="date" {...register("end_date")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Planned budget (goods)"
                type="number"
                inputMode="decimal"
                placeholder="52000"
                suffix="₹"
                {...register("planned_budget")}
              />
              <Input
                label="Estimated expenses"
                type="number"
                inputMode="decimal"
                placeholder={
                  legsTravelPaise > 0 ? String(legsTravelPaise / 100) : "9000"
                }
                suffix="₹"
                hint={
                  legsTravelPaise > 0
                    ? `Leave blank to use the route travel total (${formatInr(legsTravelPaise)}).`
                    : "Travel + lodging + food estimate."
                }
                {...register("estimated_expenses")}
              />
            </div>
            <Input
              label="Expected margin"
              type="number"
              inputMode="decimal"
              placeholder="35"
              suffix="%"
              hint="Blended expected markup used for the forecast."
              {...register("expected_margin")}
            />
            <Input label="Notes" {...register("notes")} />
          </div>
          <h3 className="border-b border-border pb-2 text-base font-medium text-fg">
            Route{" "}
            <span className="text-sm font-normal text-fg-muted">
              (Each place you'll travel to. Click Verify on map to check.)
            </span>
          </h3>
          <div className="mt-4">
            <RouteLegsTable
              value={legs}
              onChange={setLegs}
              showErrors={legErrors}
            />
          </div>
        </Card>

        {forecast && (
          <Card title="Forecast" desc="Estimate only — not a guarantee.">
            <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-fg-muted">Investment</dt>
                <dd className="font-medium text-fg">
                  {formatInr(forecast.plannedInvestmentPaise)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">Proj. revenue</dt>
                <dd className="font-medium text-fg">
                  {formatInr(forecast.projectedRevenuePaise)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">Proj. profit</dt>
                <dd
                  className={`font-medium ${
                    forecast.projectedProfitPaise < 0
                      ? "text-red-500"
                      : "text-fg"
                  }`}
                >
                  {formatInr(forecast.projectedProfitPaise)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">Proj. ROI</dt>
                <dd className="font-medium text-fg">
                  {Math.round(forecast.projectedRoiPct * 100)}%
                </dd>
              </div>
            </dl>
          </Card>
        )}

        {serverError && <p className="text-sm text-red-500">{serverError}</p>}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(listTo)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create trip"}
          </Button>
        </div>
      </form>
    </div>
  );
}
