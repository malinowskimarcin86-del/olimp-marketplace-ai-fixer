## PL summary

Projekt realizuje deterministyczne czyszczenie eksportu partnera marketplace:
- normalizuje wymiary, kolory, cenę, stany i EAN,
- czyści opisy HTML/JSON,
- generuje tytuły Allegro,
- prezentuje wynik w dashboardzie,
- umożliwia eksport CSV/XLSX.

# Marketplace operations — partner export normalizer

## Goal

Internal **B2B tool** to load a partner’s dirty product export (`data/partner_export_dirty.json`), **normalize** fields deterministically, **review** data quality in a dashboard, and **export** cleaned rows to CSV/XLSX before channel listing (e.g. Allegro). The project was prepared as a **recruitment task** solution for **Olimp Marketplace**.

## Why deterministic parsing for core cleaning

Partner data must be **auditable and reproducible**: same input always yields the same output, with explicit **issue codes** instead of silent fixes. Core cleaning uses **rules and parsers** (regex, JSON/HTML handling, ordered key reads)—not LLM inference—so reviewers can trust diffs, exports, and issue trails.

## Normalization (summary)

| Area | Approach |
|------|-----------|
| **Descriptions** | Unwrap JSON string layers when present; for objects, recurse into nested `sections` / `items` / `content` (and related keys), strip noise tokens (e.g. `TEXT`), then **HTML strip** (cheerio + fallback) and collapse whitespace. |
| **Dimensions** | Regex on scanned text (name + descriptions): `*` / `x` / units `cm` \| `mm` \| `m`; **mm** or large bare pairs normalized to **cm**; output like `40 x 60 cm` (multiple hits joined with `;`). |
| **Colors** | Expand `j.` → `jasny`, `c.` → `ciemny`; strip dimension-like spans; take trailing color run against a fixed stem list; **pl-PL** lowercase for the normalized value. |
| **Stock** | Integers as strings; **`dużo`** canonicalized; other text trimmed; empty placeholders → missing. |
| **Price** | Parse `59.90 PLN`, `59,90`, `75.00`; EU/US comma/dot rules; **PLN** assumed when amount parses but currency is absent (logged as info). |
| **EAN** | Digits only; valid lengths 8 / 12 / 13 / 14; empty string → **warning** `ean_missing_empty`; `BŁĄD_ODCZYTU` → invalid + warning; unusual length still surfaced. |

Source fields are read only from the export schema: **`NAZWA ORG`**, **`SKU`**, **`Cena`**, **`Opis ofe`**, **`Stany`**, **`EAN`**.

## Allegro titles

Titles are built for **sales-ready Polish copy**, max **75** characters:

- For **Belweder bathroom-mat style** names, core is fixed to **`Dywanik łazienkowy Belweder`** (avoids duplicated “Łazienkowy” from `Dyw. Łazienkowy`).
- **Suffix**: first normalized dimension phrase + **normalized color** (no raw `j.` / `c.` in the title).
- **Fallback** for other products: strip bracketed SKUs, expand `Dyw.`, remove dimensions/colors from the core, dedupe consecutive words, then trim to length.

## Dashboard (`/dashboard`)

- **KPIs**: total rows, rows with issues, high-confidence count, EAN missing/invalid count.
- **Table**: searchable, sortable, filters by **confidence** and **issue presence**; row click opens a **detail dialog** (before/after, descriptions, extracted dimensions/color, issues, raw JSON).
- **Exports**: CSV and XLSX apply to the **currently visible** rows (after filters and sort).

Temporary validation UI: **`/debug/transform`** (wide debug table).

## CSV / XLSX export

- **CSV**: `rowsToCsv` (RFC 4180-style quoting) + UTF-8 BOM for Excel; matrix built in `src/lib/export/build-product-export-matrix.ts`.
- **XLSX**: `xlsx` in the browser, single sheet **“Produkty”**, same column set as the export matrix (SKU, names, Allegro title, dimensions, color, price, currency, stock, EAN, confidence, issue counts/codes, original price).

## Setup & run

```bash
npm install
npm run dev
```

After `npm run dev`, open:

- **App:** `/`
- **Dashboard:** `/dashboard`
- **Validation view:** `/debug/transform`

Place (or replace) partner data at **`data/partner_export_dirty.json`** (JSON **array** of objects).

```bash
npm run build   # production build
npm run start   # serve production build
npm run lint    # ESLint
```

## Known limitations

- **Schema**: tied to the six export keys; extra fields are ignored unless added to types/transform explicitly.
- **Color / brand heuristics**: Allegro title uses a **Belweder + bath mat** shortcut; other catalogs need fallback rules or config.
- **Embedded JSON**: description extraction favors known nested shapes; odd schemas may still yield thin text (issues should reflect that).
- **EAN**: check digit not validated; unusual lengths are flagged but may still be exported as digits.

## Future improvements

- Config-driven **abbreviation maps** and **title templates** per partner or category.
- **Zod** (or similar) for runtime validation once the export schema is frozen.
- **Server-side export** routes for large files and audit logging.
- Role-based access and **removal** of `/debug/transform` in production.
