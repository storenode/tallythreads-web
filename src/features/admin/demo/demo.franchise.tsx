import { useOrganizations } from "../organizations/organizations";
import FranchiseCard from "./components/franchise.card";
import { CreateFranchiseForm } from "./components/franchise.form";

export default function DemoFranchise() {
  const { data: orgs, isLoading, isError } = useOrganizations();
  const franchiseOrg = orgs?.find(
    (entity) => entity.is_demo && entity.registration_type === "franchise",
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading organizations…</p>
      ) : isError ? (
        <p className="text-sm text-red-500">Couldn't load organizations.</p>
      ) : franchiseOrg ? (
        <FranchiseCard organization={franchiseOrg} />
      ) : (
        <CreateFranchiseForm />
      )}
    </div>
  );
}
