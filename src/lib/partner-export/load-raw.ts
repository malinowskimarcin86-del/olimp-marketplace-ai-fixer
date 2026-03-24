import { readFile } from "node:fs/promises";

import { tryParseJson } from "@/lib/safe-parse";

import { PARTNER_EXPORT_FILE } from "./paths";

export type LoadRawResult =
  | { ok: true; raw: unknown; path: string }
  | { ok: false; path: string; issues: { code: string; message: string }[] };

/** Loads and parses `data/partner_export_dirty.json` on the server (UTF-8). */
export async function loadPartnerExportRaw(): Promise<LoadRawResult> {
  const path = PARTNER_EXPORT_FILE;
  try {
    const text = await readFile(path, "utf8");
    const parsed = tryParseJson(text);
    if (!parsed.ok) {
      return {
        ok: false,
        path,
        issues: [{ code: "json_parse", message: parsed.error }],
      };
    }
    return { ok: true, raw: parsed.value, path };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      path,
      issues: [{ code: "read_file", message }],
    };
  }
}
