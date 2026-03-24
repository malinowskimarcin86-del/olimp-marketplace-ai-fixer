"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";

import { ProductDetailDialog } from "@/components/dashboard/product-detail-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { productsToCsvString, productsToExportMatrix } from "@/lib/export/build-product-export-matrix";
import type { NormalizedProduct, ProductConfidenceLevel } from "@/types/product";

import * as XLSX from "xlsx";

type SortKey =
  | "sku"
  | "original_name"
  | "allegro_title"
  | "dimensions_normalized"
  | "color_normalized"
  | "price_value"
  | "stock_normalized"
  | "ean_normalized"
  | "confidence"
  | "issues_count";

type SortDir = "asc" | "desc";

type ConfidenceFilter = "all" | ProductConfidenceLevel;
type IssuesFilter = "all" | "has_issues" | "clean";

const CONFIDENCE_ORDER: Record<ProductConfidenceLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportFilename(prefix: string, ext: string) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `${prefix}-${stamp}.${ext}`;
}

function sortProducts(products: NormalizedProduct[], key: SortKey, dir: SortDir): NormalizedProduct[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...products].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "sku":
        cmp = a.sku.localeCompare(b.sku, "pl", { sensitivity: "base" });
        break;
      case "original_name":
        cmp = (a.original_name ?? "").localeCompare(b.original_name ?? "", "pl", { sensitivity: "base" });
        break;
      case "allegro_title":
        cmp = (a.allegro_title ?? "").localeCompare(b.allegro_title ?? "", "pl", { sensitivity: "base" });
        break;
      case "dimensions_normalized":
        cmp = (a.dimensions_normalized ?? "").localeCompare(b.dimensions_normalized ?? "", "pl", {
          sensitivity: "base",
        });
        break;
      case "color_normalized":
        cmp = (a.color_normalized ?? "").localeCompare(b.color_normalized ?? "", "pl", { sensitivity: "base" });
        break;
      case "price_value": {
        const pa = a.price_value ?? -Infinity;
        const pb = b.price_value ?? -Infinity;
        cmp = pa === pb ? 0 : pa < pb ? -1 : 1;
        break;
      }
      case "stock_normalized":
        cmp = (a.stock_normalized ?? "").localeCompare(b.stock_normalized ?? "", "pl", { numeric: true });
        break;
      case "ean_normalized":
        cmp = (a.ean_normalized ?? "").localeCompare(b.ean_normalized ?? "", "pl", { sensitivity: "base" });
        break;
      case "confidence":
        cmp = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
        break;
      case "issues_count":
        cmp = a.issues.length - b.issues.length;
        break;
      default:
        cmp = 0;
    }
    return cmp * mul;
  });
}

function matchesSearch(p: NormalizedProduct, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const hay = [
    p.sku,
    p.original_name,
    p.allegro_title,
    p.dimensions_normalized,
    p.color_normalized,
    p.stock_normalized,
    p.ean_normalized,
    p.confidence,
    p.original_price,
    p.currency,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function ConfidenceBadge({ level }: { level: ProductConfidenceLevel }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-0.5 text-xs font-medium tracking-wide uppercase",
        level === "high" && "bg-emerald-100 text-emerald-900",
        level === "medium" && "bg-amber-100 text-amber-950",
        level === "low" && "bg-zinc-200 text-zinc-800",
      )}
    >
      {level}
    </span>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onToggle,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between gap-1 text-left text-xs font-semibold tracking-wide text-zinc-700 uppercase hover:text-zinc-900",
        active && "text-zinc-900",
      )}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px] text-zinc-400">{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

export type MarketplaceDashboardClientProps = {
  products: NormalizedProduct[];
  loadOk: boolean;
  rootWasArray: boolean;
  loadIssues: { code: string; message: string }[];
};

export function MarketplaceDashboardClient({
  products: allProducts,
  loadOk,
  rootWasArray,
  loadIssues,
}: MarketplaceDashboardClientProps) {
  const [search, setSearch] = React.useState("");
  const [confidenceFilter, setConfidenceFilter] = React.useState<ConfidenceFilter>("all");
  const [issuesFilter, setIssuesFilter] = React.useState<IssuesFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("sku");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [selected, setSelected] = React.useState<NormalizedProduct | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const totalProducts = allProducts.length;
  const withIssues = React.useMemo(() => allProducts.filter((p) => p.issues.length > 0).length, [allProducts]);
  const highConfidence = React.useMemo(() => allProducts.filter((p) => p.confidence === "high").length, [allProducts]);
  const eanProblems = React.useMemo(
    () =>
      allProducts.filter((p) => {
        if (p.ean_normalized === null) return true;
        return p.issues.some((i) => i.code.startsWith("ean_"));
      }).length,
    [allProducts],
  );

  const filtered = React.useMemo(() => {
    return allProducts.filter((p) => {
      if (!matchesSearch(p, search)) return false;
      if (confidenceFilter !== "all" && p.confidence !== confidenceFilter) return false;
      if (issuesFilter === "has_issues" && p.issues.length === 0) return false;
      if (issuesFilter === "clean" && p.issues.length > 0) return false;
      return true;
    });
  }, [allProducts, search, confidenceFilter, issuesFilter]);

  const visible = React.useMemo(() => sortProducts(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openDetail = (p: NormalizedProduct) => {
    setSelected(p);
    setDetailOpen(true);
  };

  const handleExportCsv = () => {
    const csv = productsToCsvString(visible);
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, exportFilename("marketplace-products", "csv"));
  };

  const handleExportXlsx = () => {
    const matrix = productsToExportMatrix(visible);
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produkty");
    const u8 = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([u8], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerDownload(blob, exportFilename("marketplace-products", "xlsx"));
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Operacje marketplace</h1>
          <p className="text-sm leading-relaxed text-zinc-600">
            Przegląd ofert po deterministycznej normalizacji eksportu partnera: weryfikacja tytułów, wymiarów, cen i kodów
            EAN przed publikacją na kanałach sprzedaży.
          </p>
          <p className="text-xs text-zinc-500">
            Źródło: <span className="font-mono text-zinc-600">partner_export_dirty.json</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleExportCsv} disabled={visible.length === 0}>
            <Download className="size-3.5" />
            Eksport CSV
          </Button>
          <Button type="button" variant="default" size="sm" onClick={handleExportXlsx} disabled={visible.length === 0}>
            <Download className="size-3.5" />
            Eksport XLSX
          </Button>
        </div>
      </header>

      {!loadOk || !rootWasArray || loadIssues.length > 0 ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            !loadOk || !rootWasArray ? "border-red-200 bg-red-50 text-red-950" : "border-amber-200 bg-amber-50 text-amber-950",
          )}
        >
          <p className="font-medium">{!loadOk ? "Nie udało się wczytać pliku." : !rootWasArray ? "Nieprawidłowy format JSON (oczekiwano tablicy)." : "Ostrzeżenia wczytywania"}</p>
          <ul className="mt-2 list-inside list-disc text-sm opacity-90">
            {loadIssues.map((i) => (
              <li key={i.code}>
                <span className="font-mono text-xs">{i.code}</span> — {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Łącznie produktów" value={String(totalProducts)} />
        <KpiCard label="Z problemami (issues)" value={String(withIssues)} />
        <KpiCard label="Wysoka pewność" value={String(highConfidence)} />
        <KpiCard label="EAN brak / niepoprawny" value={String(eanProblems)} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder="Szukaj po SKU, nazwie, tytule, wymiarach…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white pr-3 pl-10 text-sm text-zinc-900 outline-none ring-zinc-300 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <span className="shrink-0">Pewność</span>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
              >
                <option value="all">Wszystkie</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <span className="shrink-0">Issues</span>
              <select
                value={issuesFilter}
                onChange={(e) => setIssuesFilter(e.target.value as IssuesFilter)}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
              >
                <option value="all">Wszystkie</option>
                <option value="has_issues">Z problemami</option>
                <option value="clean">Bez problemów</option>
              </select>
            </label>
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          Widoczne wiersze: <strong className="text-zinc-700">{visible.length}</strong> z {totalProducts}. Eksport CSV/XLSX
          dotyczy aktualnie widocznej tabeli (po filtrach i sortowaniu).
        </p>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/90">
                <th className="px-3 py-3">
                  <SortHeader label="SKU" active={sortKey === "sku"} dir={sortDir} onToggle={() => toggleSort("sku")} />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Nazwa źródłowa"
                    active={sortKey === "original_name"}
                    dir={sortDir}
                    onToggle={() => toggleSort("original_name")}
                  />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Tytuł Allegro"
                    active={sortKey === "allegro_title"}
                    dir={sortDir}
                    onToggle={() => toggleSort("allegro_title")}
                  />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Wymiary"
                    active={sortKey === "dimensions_normalized"}
                    dir={sortDir}
                    onToggle={() => toggleSort("dimensions_normalized")}
                  />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Kolor"
                    active={sortKey === "color_normalized"}
                    dir={sortDir}
                    onToggle={() => toggleSort("color_normalized")}
                  />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Cena"
                    active={sortKey === "price_value"}
                    dir={sortDir}
                    onToggle={() => toggleSort("price_value")}
                  />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Stan"
                    active={sortKey === "stock_normalized"}
                    dir={sortDir}
                    onToggle={() => toggleSort("stock_normalized")}
                  />
                </th>
                <th className="px-3 py-3">
                  <SortHeader label="EAN" active={sortKey === "ean_normalized"} dir={sortDir} onToggle={() => toggleSort("ean_normalized")} />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Pewność"
                    active={sortKey === "confidence"}
                    dir={sortDir}
                    onToggle={() => toggleSort("confidence")}
                  />
                </th>
                <th className="px-3 py-3">
                  <SortHeader
                    label="Issues"
                    active={sortKey === "issues_count"}
                    dir={sortDir}
                    onToggle={() => toggleSort("issues_count")}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-zinc-500">
                    Brak wierszy spełniających kryteria.
                  </td>
                </tr>
              ) : (
                visible.map((p, idx) => (
                  <tr
                    key={`${p.id}-${idx}`}
                    onClick={() => openDetail(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(p);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-inset"
                  >
                    <td className="max-w-[120px] truncate px-3 py-2.5 font-mono text-xs text-zinc-900">{p.sku || "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-zinc-800">{p.original_name ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-zinc-800">{p.allegro_title ?? "—"}</td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 text-zinc-700">{p.dimensions_normalized ?? "—"}</td>
                    <td className="max-w-[100px] truncate px-3 py-2.5 text-zinc-700">{p.color_normalized ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-800">
                      {p.price_value !== null ? (
                        <>
                          {p.price_value}
                          {p.currency ? ` ${p.currency}` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[80px] truncate px-3 py-2.5 text-zinc-700">{p.stock_normalized ?? "—"}</td>
                    <td className="max-w-[110px] truncate px-3 py-2.5 font-mono text-xs text-zinc-700">{p.ean_normalized ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <ConfidenceBadge level={p.confidence} />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-zinc-800">{p.issues.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ProductDetailDialog
        product={selected}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
    </div>
  );
}
