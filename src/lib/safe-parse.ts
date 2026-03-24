import * as cheerio from "cheerio";

/**
 * Defensive JSON.parse — never throws; surfaces failures for auditing.
 */
export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * Best-effort HTML fragment handling for dirty partner payloads.
 * Does not guarantee semantic correctness; callers should record fallbacks.
 */
export function loadHtmlFragment(fragment: string): cheerio.CheerioAPI {
  return cheerio.load(fragment, {
    xml: false,
  });
}
