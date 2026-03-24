import path from "node:path";

export const PARTNER_EXPORT_DIR = path.join(process.cwd(), "data");
export const PARTNER_EXPORT_FILE = path.join(
  PARTNER_EXPORT_DIR,
  "partner_export_dirty.json",
);
