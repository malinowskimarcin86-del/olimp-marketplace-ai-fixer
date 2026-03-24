import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MarketplaceDashboardClient } from "@/components/dashboard/marketplace-dashboard-client";
import { assertSubmissionTransformQa } from "@/lib/transform-products-qa";
import { loadTransformedPartnerProducts } from "@/lib/validation/load-transformed-products";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const result = await loadTransformedPartnerProducts();

  const products = result.loadOk && result.rootWasArray ? result.products : [];

  if (process.env.NODE_ENV === "development" && products.length > 0) {
    const qa = assertSubmissionTransformQa(products);
    if (qa.length > 0) {
      console.warn("[transform QA]\n", qa.join("\n"));
    }
  }

  return (
    <DashboardShell>
      <MarketplaceDashboardClient
        products={products}
        loadOk={result.loadOk}
        rootWasArray={result.rootWasArray}
        loadIssues={result.loadIssues}
      />
    </DashboardShell>
  );
}
