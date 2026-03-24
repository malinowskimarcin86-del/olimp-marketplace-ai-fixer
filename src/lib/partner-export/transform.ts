import type {
  PartnerExportDirtyNormalizedRow,
  PartnerExportDirtyRoot,
} from "@/types/partner-export-dirty";
import type { DataIssue, TransformationResult } from "@/types/partner-export";

/**
 * Deterministic pipeline for this repo’s `partner_export_dirty.json`:
 * - Requires root JSON array.
 * - Emits one normalized row per element, preserving the full value under `raw` (no invented fields).
 */
export function transformPartnerExport(
  raw: unknown,
): TransformationResult<PartnerExportDirtyNormalizedRow> {
  const issues: DataIssue[] = [];

  if (!Array.isArray(raw)) {
    issues.push({
      severity: "error",
      code: "expected_array_root",
      message: "Root JSON value must be an array.",
    });
    return { raw, normalized: [], issues };
  }

  const root = raw as PartnerExportDirtyRoot;
  const normalized: PartnerExportDirtyNormalizedRow[] = root.map((element, sourceIndex) => ({
    sourceIndex,
    raw: element,
  }));

  return { raw, normalized, issues };
}
