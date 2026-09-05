import { useOrganizations } from "../organizations/organizations";
import ChainCard from "./components/chain.card";
import { CreateChainForm } from "./components/chain.form";

export default function DemoChain() {
  const { data: orgs, isLoading, isError } = useOrganizations();
  const chainOrg = orgs?.find(
    (entity) => entity.is_demo && entity.registration_type === "chain",
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading organizations…</p>
      ) : isError ? (
        <p className="text-sm text-red-500">Couldn't load organizations.</p>
      ) : chainOrg ? (
        <ChainCard organization={chainOrg} />
      ) : (
        <CreateChainForm />
      )}
    </div>
  );
}
