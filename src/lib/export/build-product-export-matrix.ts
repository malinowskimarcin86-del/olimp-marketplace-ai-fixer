import type { NormalizedProduct } from "@/types/product";

import type { SheetMatrix } from "./xlsx";
import { rowsToCsv } from "./csv";

export const PRODUCT_EXPORT_HEADERS = [
  "SKU",
  "original_name",
  "allegro_title",
  "dimensions_normalized",
  "color_normalized",
  "price_value",
  "currency",
  "stock_normalized",
  "ean_normalized",
  "confidence",
  "issues_count",
  "issue_codes",
  "original_price",
] as const;

function issueCodes(p: NormalizedProduct): string {
  return p.issues.map((i) => i.code).join("|");
}

export function productsToExportMatrix(products: NormalizedProduct[]): SheetMatrix {
  const header = [...PRODUCT_EXPORT_HEADERS];
  const rows: SheetMatrix = [
    header,
    ...products.map((p) => [
      p.sku,
      p.original_name,
      p.allegro_title,
      p.dimensions_normalized,
      p.color_normalized,
      p.price_value,
      p.currency,
      p.stock_normalized,
      p.ean_normalized,
      p.confidence,
      p.issues.length,
      issueCodes(p),
      p.original_price,
    ]),
  ];
  return rows;
}

export function productsToCsvString(products: NormalizedProduct[]): string {
  const matrix = productsToExportMatrix(products);
  const stringRows = matrix.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
  );
  return rowsToCsv(stringRows);
}
