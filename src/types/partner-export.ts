export type {
  PartnerExportDirtyElement,
  PartnerExportDirtyNormalizedRow,
  PartnerExportDirtyRoot,
} from "./partner-export-dirty";

/**
 * Back-compat alias: one raw element from the partner export array.
 * Prefer `PartnerExportDirtyElement` in new code.
 */
export type RawPartnerRecord = import("./partner-export-dirty").PartnerExportDirtyElement;

export type IssueSeverity = "error" | "warning" | "info";

/** Parse or transform step that did not fully succeed; keep for audit UI and exports. */
export type DataIssue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Stable id for the source row when available. */
  recordId?: string;
  /** Optional raw snippet — avoid huge payloads. */
  detail?: string;
};

/** Carries cleaned rows alongside raw input and a trace of problems. */
export type TransformationResult<TNormalized> = {
  raw: unknown;
  normalized: TNormalized[];
  issues: DataIssue[];
};
