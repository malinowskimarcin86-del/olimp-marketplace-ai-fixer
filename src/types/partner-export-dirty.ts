/**
 * `data/partner_export_dirty.json`: UTF-8 JSON array of partner product rows.
 * Each row is a plain object using the keys defined on `PartnerExportRow` in `types/product.ts`.
 */

import type { PartnerExportRow } from "./product";

/** Root document value after `JSON.parse` — an array of export rows. */
export type PartnerExportDirtyRoot = readonly PartnerExportRow[];

/** One element of the root array (parsed row). */
export type PartnerExportDirtyElement = PartnerExportRow;

/**
 * Normalized view: stable source index plus the full element as delivered (no field mapping).
 */
export type PartnerExportDirtyNormalizedRow = {
  sourceIndex: number;
  raw: PartnerExportDirtyElement;
};
