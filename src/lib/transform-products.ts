import * as cheerio from "cheerio";

import { tryParseJson } from "@/lib/safe-parse";
import type {
  NormalizePriceResult,
  NormalizedProduct,
  PartnerExportRow,
  ProductConfidenceLevel,
  ProductIssue,
} from "@/types/product";
import { PARTNER_EXPORT_FIELD } from "@/types/product";

const MAX_EMBEDDED_JSON_SCAN = 500_000;
const MAX_JSON_STRING_UNWRAP = 12;
const ALLEGRO_TITLE_MAX = 75;

const DIM_PATTERN = /\b(\d+)\s*[*×xX]\s*(\d+)(?:\s*(cm|mm|m))?\b/gi;

const COLOR_STEMS = new Set([
  "szary",
  "czarny",
  "biały",
  "bialy",
  "beż",
  "bez",
  "brązowy",
  "brazowy",
  "zielony",
  "niebieski",
  "czerwony",
  "żółty",
  "zolty",
  "bordowy",
  "granatowy",
  "kremowy",
  "biała",
  "biala",
  "rudy",
  "srebrny",
  "złoty",
  "zloty",
  "antracyt",
  "grafitowy",
  "ecru",
  "wielobarwny",
  "transparentny",
  "dębowy",
  "debowy",
  "wiśniowy",
  "wisniowy",
  "naturalny",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function foldPlAscii(s: string): string {
  return s
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isColorStemToken(tok: string): boolean {
  const f = foldPlAscii(tok);
  for (const c of COLOR_STEMS) {
    if (foldPlAscii(c) === f) return true;
  }
  return false;
}

function readPartnerValue(record: Record<string, unknown>, field: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, field)) return undefined;
  return record[field];
}

function coerceScalarToString(field: string, v: unknown): { text: string | null; issues: ProductIssue[] } {
  const issues: ProductIssue[] = [];
  if (v === undefined || v === null) return { text: null, issues };
  if (typeof v === "string") return { text: v, issues };
  if (typeof v === "number" && Number.isFinite(v)) return { text: String(v), issues };
  if (typeof v === "boolean") return { text: v ? "true" : "false", issues };
  if (typeof v === "object") {
    try {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      return { text: JSON.stringify(o, keys), issues };
    } catch {
      issues.push({
        code: "field_serialize_failed",
        message: `Could not serialize field "${field}" for display.`,
        severity: "warning",
      });
      return { text: null, issues };
    }
  }
  issues.push({
    code: "field_unsupported_type",
    message: `Unsupported value type for field "${field}".`,
    severity: "warning",
  });
  return { text: null, issues };
}

/** Strip HTML tags and common entities — never throws. */
export function stripHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  const s = typeof input === "string" ? input : String(input);
  if (s.length === 0) return "";
  try {
    const $ = cheerio.load(s, { xml: false });
    const text = $.root().text();
    return collapseWhitespace(text);
  } catch {
    return collapseWhitespace(
      s
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">"),
    );
  }
}

function extractBalancedJsonObject(source: string, openBraceIndex: number): string | null {
  if (source[openBraceIndex] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  const end = Math.min(source.length, openBraceIndex + MAX_EMBEDDED_JSON_SCAN);
  for (let i = openBraceIndex; i < end; i++) {
    const c = source[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  return null;
}

/**
 * Pulls the first syntactically valid JSON object substring (balanced braces, string-aware).
 * Also checks ld+json script bodies. Returns the raw JSON text slice, or null.
 */
export function extractEmbeddedJsonText(source: string): string | null {
  const trimmed = source.trim();
  if (trimmed.length === 0) return null;

  try {
    const $ = cheerio.load(trimmed, { xml: false });
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const el = scripts.get(i);
      if (!el) continue;
      const slice = $(el).text().trim();
      if (slice.length === 0) continue;
      const p = tryParseJson(slice);
      if (p.ok) return slice;
    }
  } catch {
    /* fall through */
  }

  let start = trimmed.indexOf("{");
  while (start !== -1) {
    const slice = extractBalancedJsonObject(trimmed, start);
    if (slice !== null) {
      const p = tryParseJson(slice);
      if (p.ok) return slice;
    }
    start = trimmed.indexOf("{", start + 1);
  }
  return null;
}

function jsonObjectToPlainText(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) parts.push(stripHtml(v));
    else if (typeof v === "number" && Number.isFinite(v)) parts.push(String(v));
    else if (typeof v === "boolean") parts.push(v ? "true" : "false");
  }
  return collapseWhitespace(parts.join(" "));
}

/** Drops enum-like UI tokens (e.g. TEXT) from flattened JSON text. */
function isNoiseDescriptionToken(s: string): boolean {
  const t = s.trim();
  if (t.length === 0) return true;
  if (/^[A-Z][A-Z0-9_]{0,24}$/.test(t)) return true;
  return false;
}

/**
 * Recursively pulls human-readable strings from partner JSON descriptions
 * (`sections` / `items` / `content`, etc.). Bounded depth; never throws.
 */
function collectDescriptionStrings(value: unknown, depth: number): string[] {
  if (depth > 14) return [];
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    const t = stripHtml(value).trim();
    return t.length > 0 ? [t] : [];
  }
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  if (typeof value === "boolean") return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => collectDescriptionStrings(v, depth + 1));
  }
  if (isPlainObject(value)) {
    const o = value;
    const out: string[] = [];
    const containerKeys = ["sections", "items", "blocks", "children", "rows", "columns", "elements"];
    const textKeys = ["content", "text", "html", "title", "description", "body", "caption", "subtitle", "label"];
    for (const ck of containerKeys) {
      if (ck in o) out.push(...collectDescriptionStrings(o[ck], depth + 1));
    }
    for (const tk of textKeys) {
      if (tk in o) out.push(...collectDescriptionStrings(o[tk], depth + 1));
    }
    for (const k of Object.keys(o).sort()) {
      if (containerKeys.includes(k) || textKeys.includes(k) || k === "type") continue;
      out.push(...collectDescriptionStrings(o[k], depth + 1));
    }
    return out;
  }
  return [];
}

function extractReadableTextFromDescriptionJson(obj: Record<string, unknown>): string {
  const chunks = collectDescriptionStrings(obj, 0).filter((s) => !isNoiseDescriptionToken(s));
  return collapseWhitespace(chunks.join(" "));
}

function parseDescriptionToPlainText(raw: string): { plain: string; issues: ProductIssue[] } {
  const issues: ProductIssue[] = [];
  let work = raw.trim();

  for (let depth = 0; depth < MAX_JSON_STRING_UNWRAP; depth++) {
    const p = tryParseJson(work);
    if (!p.ok) break;
    if (typeof p.value === "string") {
      work = p.value.trim();
      continue;
    }
    if (isPlainObject(p.value)) {
      const rich = extractReadableTextFromDescriptionJson(p.value);
      if (rich.length > 0) {
        work = rich;
        issues.push({
          code: "description_json_object",
          message: "Opis ofe: wyekstrahowano tekst z zagnieżdżonego JSON (sections/items/content).",
          severity: "info",
        });
      } else {
        work = jsonObjectToPlainText(p.value);
        issues.push({
          code: "description_json_object",
          message: "Opis ofe: JSON obiekt — użyto płaskich pól pierwszego poziomu.",
          severity: "info",
        });
      }
      break;
    }
    if (Array.isArray(p.value)) {
      const chunks = p.value.map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "number" && Number.isFinite(item)) return String(item);
        return "";
      });
      work = collapseWhitespace(chunks.join(" "));
      issues.push({
        code: "description_json_array",
        message: "Opis ofe parsed as JSON array; joined string/number entries only.",
        severity: "info",
      });
      break;
    }
    break;
  }

  const plain = collapseWhitespace(stripHtml(work));
  return { plain, issues };
}

/** HTML-stripped, whitespace-normalized text (no JSON unwrapping). */
export function cleanDescription(input: unknown): string {
  return stripHtml(input);
}

/**
 * Parses amounts such as `59.90 PLN`, `59,90`, `75.00`. When currency is absent but a value is parsed, assumes PLN.
 */
export function normalizePrice(priceText: string | null, explicitCurrency: string | null): NormalizePriceResult {
  const issues: ProductIssue[] = [];

  if (priceText === null || priceText.trim() === "") {
    issues.push({
      code: "price_missing",
      message: "No price text to parse.",
      severity: "warning",
    });
    return { price_value: null, currency: explicitCurrency?.toUpperCase() ?? null, issues };
  }

  let work = priceText.trim();
  let currency: string | null = explicitCurrency ? explicitCurrency.trim().toUpperCase() : null;

  const tailCur = work.match(/\b(PLN|EUR|USD|GBP|CZK|RON|HUF)\b\s*$/i);
  const headCur = work.match(/^\s*(PLN|EUR|USD|GBP|CZK|RON|HUF)\b/i);
  const zl = /zł|zl\b/i.test(work);
  if (tailCur) {
    currency = tailCur[1].toUpperCase();
    work = work.slice(0, tailCur.index).trim();
  } else if (headCur) {
    currency = headCur[1].toUpperCase();
    work = work.slice(headCur[0].length).trim();
  } else if (zl) {
    currency = "PLN";
    work = work.replace(/zł|zl\b/gi, "").trim();
  }

  work = work.replace(/[€$£]/g, "").replace(/\s/g, "");

  const num = parsePriceNumberToken(work, issues);
  let finalCurrency = currency;
  if (num !== null && finalCurrency === null) {
    finalCurrency = "PLN";
    issues.push({
      code: "currency_assumed_pln",
      message: "Currency not present in Cena; assumed PLN.",
      severity: "info",
    });
  }
  return { price_value: num, currency: finalCurrency, issues };
}

function parsePriceNumberToken(work: string, issues: ProductIssue[]): number | null {
  if (work.length === 0) {
    issues.push({
      code: "price_empty_after_strip",
      message: "Price text empty after removing currency symbols.",
      severity: "warning",
    });
    return null;
  }

  if (!/^-?[\d.,]+$/.test(work)) {
    issues.push({
      code: "price_non_numeric",
      message: "Price contains characters that are not digits, dot, or comma.",
      severity: "warning",
    });
    return null;
  }

  const comma = work.lastIndexOf(",");
  const dot = work.lastIndexOf(".");
  let normalized: string;

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      normalized = work.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = work.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    const parts = work.split(",");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      normalized = `${parts[0].replace(/\./g, "")}.${parts[1]}`;
    } else if (parts.length === 2 && parts[1].length > 2) {
      normalized = parts.join("");
      issues.push({
        code: "price_ambiguous_separator",
        message: "Comma used with more than two fractional digits; treated as thousands separator.",
        severity: "info",
      });
    } else {
      normalized = work.replace(/,/g, "");
    }
  } else {
    normalized = work;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    issues.push({
      code: "price_parse_failed",
      message: "Could not parse a finite numeric price.",
      severity: "warning",
    });
    return null;
  }
  return Math.round(n * 10_000) / 10_000;
}

function formatDimensionPair(a: number, b: number, unitRaw: string | null): string {
  const unit = unitRaw?.toLowerCase() ?? null;
  let cmA = a;
  let cmB = b;
  if (unit === "mm") {
    cmA = a / 10;
    cmB = b / 10;
  } else if (unit === "m") {
    cmA = a * 100;
    cmB = b * 100;
  } else if (unit === null && a >= 100 && b >= 100) {
    cmA = a / 10;
    cmB = b / 10;
  }
  return `${Math.round(cmA)} x ${Math.round(cmB)} cm`;
}

function extractDimensionPhrases(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(DIM_PATTERN.source, DIM_PATTERN.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const u = m[3] ?? null;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const label = formatDimensionPair(a, b, u);
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

function stripDimensionPatterns(text: string): string {
  return text.replace(new RegExp(DIM_PATTERN.source, DIM_PATTERN.flags), " ");
}

/**
 * Normalizes dimension patterns (`040*060cm`, `40x60`, `400x600 mm`, …) into `40 x 60 cm` style.
 */
export function normalizeDimensions(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = typeof input === "string" ? input.trim() : String(input).trim();
  if (s.length === 0) return null;
  const phrases = extractDimensionPhrases(s);
  if (phrases.length === 0) return null;
  return phrases.join("; ");
}

/** Expands abbreviated Polish color markers (`j.`, `c.`). */
export function expandColorAbbreviations(text: string): string {
  return text
    .replace(/\bc\.\s+/gi, "ciemny ")
    .replace(/\bj\.\s+/gi, "jasny ");
}

function extractColorNormalized(expandedName: string): string | null {
  const withoutDims = stripDimensionPatterns(expandedName);
  const tokens = collapseWhitespace(withoutDims).split(/\s+/).filter(Boolean);
  const run: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    const low = tok.toLocaleLowerCase("pl-PL");
    if (isColorStemToken(tok) || low === "jasny" || low === "ciemny") {
      run.unshift(tok);
      continue;
    }
    if (run.length > 0) break;
  }
  if (run.length === 0) return null;
  return run.join(" ").toLocaleLowerCase("pl-PL");
}

/**
 * Color normalization: `j. szary` → `jasny szary`, `c. szary` → `ciemny szary`; preserves stems like `czarny`, `beż`.
 */
export function normalizeColor(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = typeof input === "string" ? input.trim() : String(input).trim();
  if (s.length === 0) return null;
  return extractColorNormalized(expandColorAbbreviations(s));
}

/** Stock: integers as strings; qualitative values like `dużo` preserved (canonical Polish). */
export function normalizeStock(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    return String(Math.trunc(input));
  }
  const s = typeof input === "string" ? input.trim() : String(input).trim();
  if (s.length === 0) return null;
  const lower = s.toLocaleLowerCase("pl-PL");
  if (lower === "n/a" || lower === "na" || lower === "—" || lower === "-") return null;
  if (lower === "dużo" || lower === "duzo") return "dużo";
  const digits = s.replace(/[^\d-]/g, "");
  if (digits.length > 0 && /^-?\d+$/.test(digits)) {
    const n = digits.replace(/^-/, "");
    return n === "" ? "0" : n;
  }
  return collapseWhitespace(s);
}

/** EAN: empty string = missing; `BŁĄD_ODCZYTU` = invalid placeholder. */
export function normalizeEan(input: unknown): { value: string | null; issues: ProductIssue[] } {
  const issues: ProductIssue[] = [];
  if (input === null || input === undefined) {
    return { value: null, issues };
  }
  const s = typeof input === "string" ? input : String(input);
  const trimmed = s.trim();
  if (trimmed === "") {
    issues.push({
      code: "ean_missing_empty",
      message: "EAN field is empty.",
      severity: "warning",
    });
    return { value: null, issues };
  }
  if (/^BŁĄD_ODCZYTU$/i.test(trimmed)) {
    issues.push({
      code: "ean_read_error_placeholder",
      message: "EAN field contains read-error placeholder, not a barcode.",
      severity: "warning",
    });
    return { value: null, issues };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) {
    issues.push({
      code: "ean_no_digits",
      message: "EAN value has no digits.",
      severity: "warning",
    });
    return { value: null, issues };
  }
  const ok = digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14;
  if (!ok) {
    issues.push({
      code: "ean_unusual_length",
      message: `EAN/GTIN has ${digits.length} digits; expected 8, 12, 13, or 14.`,
      severity: "warning",
    });
    return { value: digits, issues };
  }
  return { value: digits, issues };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strips bracketed SKU-style tokens, e.g. `[BEL-4060-BLK]`. */
function stripBracketedSkuTokens(text: string): string {
  return collapseWhitespace(text.replace(/\[[A-Za-z0-9._-]{2,}\]/g, " "));
}

function stripStandaloneSkuFromName(name: string, sku: string): string {
  const s = sku.trim();
  if (s.length < 2 || !/^[A-Za-z0-9._-]+$/.test(s)) return name;
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(s)}(?:\\s|$)`, "g");
  return collapseWhitespace(name.replace(re, " "));
}

/** `Dyw. Łazienkowy` → single phrase, then remaining `Dyw.` → full form (no duplicated Łazienkowy). */
function expandDywToDywanikPhrase(text: string): string {
  let t = text.replace(/\bDyw\.\s*Łazienkowy\b/gi, "Dywanik łazienkowy");
  t = t.replace(/\bDyw\.\b/gi, "Dywanik łazienkowy");
  return collapseWhitespace(t);
}

function dedupeConsecutiveWordsInsensitive(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    if (out.length > 0 && tok.toLocaleLowerCase("pl-PL") === out[out.length - 1].toLocaleLowerCase("pl-PL")) {
      continue;
    }
    out.push(tok);
  }
  return out.join(" ");
}

function stripRawColorAbbrevFragments(text: string): string {
  return collapseWhitespace(text.replace(/\bj\.\s+/gi, "").replace(/\bc\.\s+/gi, ""));
}

function extractBelwederBrand(original: string): string | null {
  return /\bBelweder\b/i.test(original) ? "Belweder" : null;
}

function looksLikeBathroomMatName(original: string): boolean {
  return /dyw\.|dywanik|łazienk/i.test(original);
}

function buildAllegroTitleCoreFallback(original: string, sku: string, colorNormalized: string | null): string {
  let core = original.trim();
  core = stripBracketedSkuTokens(core);
  core = stripStandaloneSkuFromName(core, sku);
  core = expandDywToDywanikPhrase(core);
  core = stripDimensionPatterns(core);
  core = expandColorAbbreviations(core);
  core = stripTrailingColorFromCore(core, colorNormalized);
  core = stripRawColorAbbrevFragments(core);
  core = dedupeConsecutiveWordsInsensitive(core);
  return collapseWhitespace(core);
}

function stripTrailingColorFromCore(core: string, color: string | null): string {
  if (!color) return core.trim();
  const c = core.trim();
  const colorLc = color.toLocaleLowerCase("pl-PL");
  const coreLc = c.toLocaleLowerCase("pl-PL");
  const idx = coreLc.lastIndexOf(colorLc);
  if (idx !== -1 && idx === coreLc.length - colorLc.length) {
    return c.slice(0, idx).replace(/\s+$/g, "").trim();
  }
  return c;
}

/** First `N x N cm` segment when multiple are joined with `;`. */
function firstDimensionPhrase(dimensions_normalized: string | null): string | null {
  if (!dimensions_normalized) return null;
  const first = dimensions_normalized.split(";").map((x) => x.trim())[0];
  return first.length > 0 ? first : null;
}

function polishCapitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase("pl-PL") + s.slice(1);
}

function shortenCoreToBudget(core: string, suffix: string, max: number): string {
  const sep = core && suffix ? " " : "";
  const suffixNeed = suffix.length + sep.length;
  const budget = max - suffixNeed;
  if (budget < 1) return "";
  let shortCore = core;
  while (shortCore.length > budget) {
    const parts = shortCore.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      shortCore = shortCore.slice(0, Math.max(0, budget)).trimEnd();
      break;
    }
    parts.pop();
    shortCore = parts.join(" ");
  }
  return shortCore.trim();
}

/**
 * Sales-ready Polish title: typ + seria (Belweder) + wymiary + kolor znormalizowany.
 * Unika `j.` / `c.` w tytule i duplikatu „Łazienkowy”; max 75 znaków.
 */
export function generateAllegroTitle(parts: {
  original_name: string | null;
  sku: string;
  dimensions_normalized: string | null;
  color_normalized: string | null;
}): string | null {
  const sku = parts.sku.trim();
  const original = (parts.original_name ?? "").trim();
  if (!original && !sku && !parts.dimensions_normalized && !parts.color_normalized) return null;

  const dimPhrase = firstDimensionPhrase(parts.dimensions_normalized);
  const suffix = [dimPhrase, parts.color_normalized].filter(Boolean).join(" ");

  const brand = extractBelwederBrand(original);
  const bathMat = looksLikeBathroomMatName(original);

  let core: string;
  if (brand && bathMat) {
    core = `Dywanik łazienkowy ${brand}`;
  } else {
    core = buildAllegroTitleCoreFallback(original, sku, parts.color_normalized);
    if (core.length > 0) {
      core = polishCapitalizeFirst(core);
    }
  }

  let title = collapseWhitespace([core, suffix].filter(Boolean).join(" "));
  if (!title) return null;

  if (title.length > ALLEGRO_TITLE_MAX) {
    core = shortenCoreToBudget(core, suffix, ALLEGRO_TITLE_MAX);
    title = collapseWhitespace([core, suffix].filter(Boolean).join(" "));
  }
  if (title.length > ALLEGRO_TITLE_MAX) {
    title = title.slice(0, ALLEGRO_TITLE_MAX - 1).trimEnd() + "…";
  }
  return title;
}

export function buildIssues(...groups: Array<ProductIssue | undefined | ProductIssue[]>): ProductIssue[] {
  const out: ProductIssue[] = [];
  for (const g of groups) {
    if (g === undefined) continue;
    if (Array.isArray(g)) out.push(...g);
    else out.push(g);
  }
  out.sort((a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
  return out;
}

export function computeProductConfidence(product: NormalizedProduct): ProductConfidenceLevel {
  const errors = product.issues.filter((i) => i.severity === "error").length;
  const warnings = product.issues.filter((i) => i.severity === "warning").length;

  if (errors > 0) return "low";
  if (!product.original_name?.trim() && product.price_value === null) return "low";
  if (warnings >= 3) return "low";
  if (product.sku.trim() === "" && product.id.startsWith("__row_")) return "low";

  const hasName = Boolean(product.original_name?.trim());
  const hasSku = product.sku.trim() !== "";
  const hasPrice = product.price_value !== null;
  const hasTitle =
    Boolean(product.allegro_title) &&
    product.allegro_title !== null &&
    product.allegro_title.length <= ALLEGRO_TITLE_MAX;

  if (warnings === 0 && hasSku && hasName && hasPrice && hasTitle) return "high";
  if (warnings <= 1 && (hasName || hasPrice) && hasSku) return "medium";
  if (warnings <= 2 && (hasName || hasPrice)) return "medium";
  return "low";
}

/**
 * Map one partner export row to `NormalizedProduct`. Never throws.
 */
export function transformProductRecord(raw: unknown, sourceIndex: number): NormalizedProduct {
  const issueAcc: ProductIssue[] = [];

  if (!isPlainObject(raw)) {
    const issues = buildIssues([
      {
        code: "record_not_object",
        message: "Export row is not a plain JSON object; expected partner export keys.",
        severity: "error",
      },
    ]);
    const product: NormalizedProduct = {
      id: `__row_${sourceIndex}`,
      sku: "",
      original_name: null,
      original_price: null,
      price_value: null,
      currency: null,
      original_description: null,
      clean_description: null,
      dimensions_normalized: null,
      color_normalized: null,
      stock_normalized: null,
      ean_normalized: null,
      allegro_title: null,
      issues,
      confidence: "low",
      raw,
    };
    product.confidence = computeProductConfidence(product);
    return product;
  }

  const record = raw as PartnerExportRow & Record<string, unknown>;

  const nameCoerced = coerceScalarToString(PARTNER_EXPORT_FIELD.NAME, readPartnerValue(record, PARTNER_EXPORT_FIELD.NAME));
  issueAcc.push(...nameCoerced.issues);
  const original_name = nameCoerced.text?.trim() ?? null;

  const skuCoerced = coerceScalarToString(PARTNER_EXPORT_FIELD.SKU, readPartnerValue(record, PARTNER_EXPORT_FIELD.SKU));
  issueAcc.push(...skuCoerced.issues);
  const sku = (skuCoerced.text ?? "").trim();
  const id = sku !== "" ? sku : `__row_${sourceIndex}`;

  if (sku === "") {
    issueAcc.push({
      code: "sku_missing",
      message: "SKU is empty or missing.",
      severity: "warning",
    });
  }

  const priceCoerced = coerceScalarToString(PARTNER_EXPORT_FIELD.PRICE, readPartnerValue(record, PARTNER_EXPORT_FIELD.PRICE));
  issueAcc.push(...priceCoerced.issues);
  const original_price = priceCoerced.text?.trim() ?? null;
  const priceResult = normalizePrice(original_price, null);

  const opisCoerced = coerceScalarToString(
    PARTNER_EXPORT_FIELD.DESCRIPTION,
    readPartnerValue(record, PARTNER_EXPORT_FIELD.DESCRIPTION),
  );
  issueAcc.push(...opisCoerced.issues);
  const original_description = opisCoerced.text?.trim() ?? null;

  let clean_description: string | null = null;
  if (original_description !== null && original_description.length > 0) {
    const parsed = parseDescriptionToPlainText(original_description);
    issueAcc.push(...parsed.issues);
    clean_description = parsed.plain.length > 0 ? parsed.plain : null;
    if (extractEmbeddedJsonText(original_description) !== null) {
      issueAcc.push({
        code: "description_embedded_json",
        message: "Description text contains an embedded JSON object fragment.",
        severity: "info",
      });
    }
  }

  const scanTextForDims = collapseWhitespace(
    [original_name ?? "", clean_description ?? "", original_description ?? ""].join(" "),
  );
  const dimensions_normalized = normalizeDimensions(scanTextForDims);

  const color_normalized =
    normalizeColor(original_name ?? "") ??
    normalizeColor(clean_description ?? "") ??
    normalizeColor(original_description ?? "");

  const stockRaw = readPartnerValue(record, PARTNER_EXPORT_FIELD.STOCK);
  const stock_normalized = normalizeStock(stockRaw);

  const eanRaw = readPartnerValue(record, PARTNER_EXPORT_FIELD.EAN);
  const eanResult = normalizeEan(eanRaw);

  const allegro_title = generateAllegroTitle({
    original_name,
    sku,
    dimensions_normalized,
    color_normalized,
  });

  const issues = buildIssues(issueAcc, priceResult.issues, eanResult.issues);

  const product: NormalizedProduct = {
    id,
    sku,
    original_name,
    original_price,
    price_value: priceResult.price_value,
    currency: priceResult.currency,
    original_description,
    clean_description,
    dimensions_normalized,
    color_normalized,
    stock_normalized,
    ean_normalized: eanResult.value,
    allegro_title,
    issues,
    confidence: "low",
    raw,
  };
  product.confidence = computeProductConfidence(product);
  return product;
}

export function transformProductsFromPartnerExport(parsedRoot: unknown): NormalizedProduct[] {
  if (!Array.isArray(parsedRoot)) {
    return [];
  }
  return parsedRoot.map((el, i) => transformProductRecord(el, i));
}
