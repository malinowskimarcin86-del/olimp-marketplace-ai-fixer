<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Marketplace operations tool — agent rules

## Data and parsing

- Prefer **deterministic parsing and explicit rules** for core data cleaning. Do not rely on LLM inference for normalizing partner or product fields.
- **Do not invent source fields** if the JSON schema is unclear. Model unknown areas as `unknown`, validate with documented schemas (e.g. Zod) once defined, and keep types honest.
- Handle **malformed HTML** and **malformed embedded JSON** defensively (try/catch, safe parsers, bounded fallbacks). Never assume well-formed partner payloads.
- Keep transformations **auditable**: small pure functions, clear step names, and structured issue records (codes + messages) rather than silent coercion.

## Product and UX

- Build a **professional B2B / internal ops** UI: clear hierarchy, neutral palette, readable tables and filters. Avoid flashy marketing or “AI product” landing aesthetics unless explicitly requested.

## Traceability

- **Preserve raw input** alongside normalized output so reviewers can diff and compare.
- **Surface issues and fallbacks** in the UI and export metadata; do not hide uncertainty or silently drop problematic rows without recording why.

## Project layout (intended)

- `data/` — inputs such as `partner_export_dirty.json` (not all inputs need to be committed).
- `src/lib/partner-export/` — load + deterministic transform pipeline.
- `src/lib/export/` — CSV / XLSX helpers for ops exports.
- `src/lib/safe-parse.ts` — shared defensive parse helpers (e.g. JSON, HTML fragments).
- `src/types/` — shared TypeScript types for exports and normalized models.
- `src/components/dashboard/` — dashboard-specific UI building blocks.
