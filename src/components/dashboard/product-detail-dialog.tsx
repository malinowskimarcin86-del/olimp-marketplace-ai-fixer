"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NormalizedProduct, ProductIssue } from "@/types/product";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</div>
      <div className="text-sm text-zinc-900">{children}</div>
    </div>
  );
}

function CompareRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/80 p-3">
      <div className="text-xs font-medium text-zinc-600">{label}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-zinc-500">Przed</div>
          <div className="mt-0.5 text-sm text-zinc-800">{before || "—"}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-500">Po normalizacji</div>
          <div className="mt-0.5 text-sm font-medium text-zinc-900">{after || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function IssuesList({ issues }: { issues: ProductIssue[] }) {
  if (issues.length === 0) {
    return <p className="text-sm text-zinc-500">Brak zgłoszonych problemów.</p>;
  }
  return (
    <ul className="space-y-2">
      {issues.map((i, idx) => (
        <li
          key={`${i.code}-${idx}`}
          className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <span className="font-mono text-xs text-zinc-600">{i.code}</span>
          <span className="mx-2 text-zinc-300">·</span>
          <span
            className={cn(
              "text-xs font-medium uppercase",
              i.severity === "error" && "text-red-700",
              i.severity === "warning" && "text-amber-800",
              i.severity === "info" && "text-zinc-600",
            )}
          >
            {i.severity}
          </span>
          <p className="mt-1 text-zinc-800">{i.message}</p>
        </li>
      ))}
    </ul>
  );
}

type ProductDetailDialogProps = {
  product: NormalizedProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function sourceSnippetForExtraction(product: NormalizedProduct): string {
  const parts = [product.original_name, (product.clean_description ?? "").slice(0, 160)].filter(Boolean);
  const s = parts.join(" ").trim();
  return s.length > 0 ? s : "—";
}

function eanFromRaw(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && "EAN" in raw) {
    const v = (raw as Record<string, unknown>).EAN;
    if (v === null || v === undefined) return "—";
    return String(v);
  }
  return "—";
}

export function ProductDetailDialog({ product, open, onOpenChange }: ProductDetailDialogProps) {
  const rawJson = React.useMemo(() => {
    if (!product) return "";
    try {
      return JSON.stringify(product.raw, null, 2);
    } catch {
      return String(product.raw);
    }
  }, [product]);

  const extractionSource = product ? sourceSnippetForExtraction(product) : "—";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-zinc-950/40" />
        <Dialog.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 flex max-h-[min(90vh,880px)] w-[min(100vw-2rem,640px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-zinc-200 bg-white shadow-lg outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight text-zinc-900">
                {product?.sku ? `Szczegóły: ${product.sku}` : "Szczegóły produktu"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-zinc-600">
                Porównanie danych źródłowych z polami po transformacji.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="Zamknij">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {product ? (
              <div className="space-y-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-900">Tytuły</h3>
                  <Field label="Oryginalna nazwa (źródło)">{product.original_name ?? "—"}</Field>
                  <Field label="Tytuł Allegro (wygenerowany)">{product.allegro_title ?? "—"}</Field>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-900">Opis</h3>
                  <Field label="Oryginalny opis (pole źródłowe)">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">
                      {product.original_description ?? "—"}
                    </pre>
                  </Field>
                  <Field label="Opis po oczyszczeniu">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">
                      {product.clean_description ?? "—"}
                    </pre>
                  </Field>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-900">Wartości: przed → po</h3>
                  <p className="text-xs text-zinc-500">
                    Fragment nazwy i opisu użyty do wykrywania wymiarów i koloru (deterministyczny skan tekstu).
                  </p>
                  <CompareRow
                    label="Wymiary — tekst źródłowy vs znormalizowane"
                    before={extractionSource}
                    after={product.dimensions_normalized ?? "—"}
                  />
                  <CompareRow
                    label="Kolor — tekst źródłowy vs znormalizowany"
                    before={extractionSource}
                    after={product.color_normalized ?? "—"}
                  />
                  <CompareRow
                    label="Cena (tekst → wartość)"
                    before={product.original_price ?? "—"}
                    after={
                      product.price_value !== null
                        ? `${product.price_value}${product.currency ? ` ${product.currency}` : ""}`
                        : "—"
                    }
                  />
                  <CompareRow label="EAN (pole źródłowe vs znormalizowane)" before={eanFromRaw(product.raw)} after={product.ean_normalized ?? "—"} />
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-900">Wydobyte pola</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Wymiary (znormalizowane)">{product.dimensions_normalized ?? "—"}</Field>
                    <Field label="Kolor (znormalizowany)">{product.color_normalized ?? "—"}</Field>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-900">Jakość danych</h3>
                  <Field label="Pewność">{product.confidence}</Field>
                  <div>
                    <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                      Lista problemów
                    </div>
                    <div className="mt-2">
                      <IssuesList issues={product.issues} />
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-900">Surowy rekord (JSON)</h3>
                  <pre className="max-h-56 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800">
                    {rawJson}
                  </pre>
                </section>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
