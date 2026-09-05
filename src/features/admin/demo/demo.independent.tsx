import { useOrganizations } from "../organizations/organizations";
import IndependentCard from "./components/independent.card";
import { CreateIndependentForm } from "./components/independent.form";

export default function DemoIndependent() {
  const { data: orgs, isLoading, isError } = useOrganizations();
  const independentOrg = orgs?.find(
    (entity) => entity.is_demo && entity.registration_type === "independent",
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading organizations…</p>
      ) : isError ? (
        <p className="text-sm text-red-500">Couldn't load organizations.</p>
      ) : independentOrg ? (
        <IndependentCard organization={independentOrg} />
      ) : (
        <CreateIndependentForm />
      )}
    </div>
  );
}
