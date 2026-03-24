import type { NormalizedProduct } from "@/types/product";

/**
 * Deterministic checks against the four-row `partner_export_dirty.json` fixture.
 * Used for submission QA (e.g. dev dashboard load); returns human-readable mismatch lines.
 */
export function assertSubmissionTransformQa(products: NormalizedProduct[]): string[] {
  const errs: string[] = [];
  if (products.length !== 4) {
    errs.push(`Expected 4 products, got ${products.length}.`);
  }

  const bySku = new Map(products.map((p) => [p.sku, p]));

  const expect = (sku: string, check: (p: NormalizedProduct) => string | null) => {
    const p = bySku.get(sku);
    if (!p) {
      errs.push(`Missing product ${sku}.`);
      return;
    }
    const msg = check(p);
    if (msg) errs.push(`${sku}: ${msg}`);
  };

  expect("BEL-4060-BLK", (p) => {
    if (p.allegro_title !== "Dywanik łazienkowy Belweder 40 x 60 cm czarny") {
      return `allegro_title mismatch: ${JSON.stringify(p.allegro_title)}`;
    }
    if (p.dimensions_normalized !== "40 x 60 cm") return `dimensions: ${p.dimensions_normalized}`;
    if (p.color_normalized !== "czarny") return `color: ${p.color_normalized}`;
    if (!p.clean_description || p.clean_description.length < 20) {
      return `clean_description too short or empty: ${p.clean_description?.length ?? 0} chars`;
    }
    if (p.confidence !== "high") return `confidence expected high, got ${p.confidence}`;
    const bad = p.issues.filter((i) => i.severity === "error" || i.severity === "warning");
    if (bad.length > 0) return `unexpected error/warning issues: ${bad.map((i) => i.code).join(", ")}`;
    return null;
  });

  expect("BEL-4060-GRY-L", (p) => {
    if (p.allegro_title !== "Dywanik łazienkowy Belweder 40 x 60 cm jasny szary") {
      return `allegro_title mismatch: ${JSON.stringify(p.allegro_title)}`;
    }
    if (p.dimensions_normalized !== "40 x 60 cm") return `dimensions: ${p.dimensions_normalized}`;
    if (p.color_normalized !== "jasny szary") return `color: ${p.color_normalized}`;
    if (!p.clean_description || p.clean_description.length < 30) {
      return `clean_description too short (embedded JSON): ${p.clean_description?.length ?? 0} chars`;
    }
    const cd = p.clean_description.toLowerCase();
    if (!cd.includes("belweder") && !cd.includes("chłonn")) {
      return "clean_description missing expected keywords from JSON content";
    }
    if (p.allegro_title.includes("j.")) return "allegro_title still contains raw j. abbreviation";
    if (p.confidence !== "high") return `confidence expected high, got ${p.confidence}`;
    const bad = p.issues.filter((i) => i.severity === "error" || i.severity === "warning");
    if (bad.length > 0) return `unexpected error/warning issues: ${bad.map((i) => i.code).join(", ")}`;
    return null;
  });

  expect("BEL-5080-BEG", (p) => {
    if (p.allegro_title !== "Dywanik łazienkowy Belweder 50 x 80 cm beż") {
      return `allegro_title mismatch: ${JSON.stringify(p.allegro_title)}`;
    }
    if (p.dimensions_normalized !== "50 x 80 cm") return `dimensions: ${p.dimensions_normalized}`;
    if (p.color_normalized !== "beż") return `color: ${p.color_normalized}`;
    if (!p.clean_description || p.clean_description.length < 15) {
      return `clean_description too short: ${p.clean_description?.length ?? 0} chars`;
    }
    if (p.ean_normalized !== null) return `EAN should be null (empty string source)`;
    const eanIss = p.issues.some((i) => i.code === "ean_missing_empty");
    if (!eanIss) return "expected ean_missing_empty issue for empty EAN";
    if (p.confidence !== "medium") return `confidence expected medium (EAN warning), got ${p.confidence}`;
    return null;
  });

  expect("BEL-5080-GRY-D", (p) => {
    if (p.allegro_title !== "Dywanik łazienkowy Belweder 50 x 80 cm ciemny szary") {
      return `allegro_title mismatch: ${JSON.stringify(p.allegro_title)}`;
    }
    if (p.dimensions_normalized !== "50 x 80 cm") return `dimensions: ${p.dimensions_normalized}`;
    if (p.color_normalized !== "ciemny szary") return `color: ${p.color_normalized}`;
    if (!p.clean_description || p.clean_description.length < 20) {
      return `clean_description too short (embedded JSON): ${p.clean_description?.length ?? 0} chars`;
    }
    if (p.allegro_title.includes("c.")) return "allegro_title still contains raw c. abbreviation";
    if (p.ean_normalized !== null) return "EAN should be null (BŁĄD_ODCZYTU)";
    const eanIss = p.issues.some((i) => i.code === "ean_read_error_placeholder");
    if (!eanIss) return "expected ean_read_error_placeholder issue";
    if (p.confidence !== "medium") return `confidence expected medium, got ${p.confidence}`;
    return null;
  });

  return errs;
}
