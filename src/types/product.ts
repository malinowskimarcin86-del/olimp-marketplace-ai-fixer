export type ProductIssueSeverity = "error" | "warning" | "info";

/** Structured problem surfaced on a normalized product (auditable, deterministic codes). */
export type ProductIssue = {
  code: string;
  message: string;
  severity: ProductIssueSeverity;
};

/**
 * Exact top-level keys on each object in `data/partner_export_dirty.json`.
 * Values are left as `unknown` at the edge; the transformer coerces defensively.
 */
export type PartnerExportRow = {
  "NAZWA ORG"?: unknown;
  SKU?: unknown;
  Cena?: unknown;
  "Opis ofe"?: unknown;
  Stany?: unknown;
  EAN?: unknown;
};

export const PARTNER_EXPORT_FIELD = {
  NAME: "NAZWA ORG",
  SKU: "SKU",
  PRICE: "Cena",
  DESCRIPTION: "Opis ofe",
  STOCK: "Stany",
  EAN: "EAN",
} as const;

/** Categorical data-quality bucket derived from issues and core fields. */
export type ProductConfidenceLevel = "high" | "medium" | "low";

/**
 * Normalized marketplace product row after deterministic cleaning.
 * `raw` is the exact source object from the partner export array.
 */
export type NormalizedProduct = {
  id: string;
  sku: string;
  original_name: string | null;
  original_price: string | null;
  price_value: number | null;
  currency: string | null;
  original_description: string | null;
  clean_description: string | null;
  dimensions_normalized: string | null;
  color_normalized: string | null;
  stock_normalized: string | null;
  ean_normalized: string | null;
  allegro_title: string | null;
  issues: ProductIssue[];
  confidence: ProductConfidenceLevel;
  raw: unknown;
};

export type NormalizePriceResult = {
  price_value: number | null;
  currency: string | null;
  issues: ProductIssue[];
};
