import { loadPartnerExportRaw } from "@/lib/partner-export";
import { transformProductsFromPartnerExport } from "@/lib/transform-products";
import type { NormalizedProduct } from "@/types/product";

export type LoadTransformedProductsResult = {
  path: string;
  loadOk: boolean;
  loadIssues: { code: string; message: string }[];
  rootWasArray: boolean;
  products: NormalizedProduct[];
};

/**
 * Server-only: reads `data/partner_export_dirty.json` and runs `transformProductsFromPartnerExport`.
 */
export async function loadTransformedPartnerProducts(): Promise<LoadTransformedProductsResult> {
  const loaded = await loadPartnerExportRaw();
  if (!loaded.ok) {
    return {
      path: loaded.path,
      loadOk: false,
      loadIssues: loaded.issues,
      rootWasArray: false,
      products: [],
    };
  }

  const rootWasArray = Array.isArray(loaded.raw);
  const products = transformProductsFromPartnerExport(loaded.raw);

  return {
    path: loaded.path,
    loadOk: true,
    loadIssues: rootWasArray ? [] : [{ code: "expected_array_root", message: "Root JSON value is not an array." }],
    rootWasArray,
    products,
  };
}
