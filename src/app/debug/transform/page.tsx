import type { CSSProperties } from "react";

import { loadTransformedPartnerProducts } from "@/lib/validation/load-transformed-products";

export const dynamic = "force-dynamic";

const cell: CSSProperties = {
  border: "1px solid #ccc",
  padding: 6,
  wordBreak: "break-word",
  verticalAlign: "top",
  fontSize: 12,
};

const th: CSSProperties = {
  ...cell,
  fontSize: 11,
};

function formatIssues(issues: { code: string; message: string; severity?: string }[]) {
  if (issues.length === 0) return "—";
  return issues.map((i) => `${i.code}: ${i.message}`).join("; ");
}

const COLUMNS = [
  "original_name",
  "original_description",
  "clean_description",
  "allegro_title",
  "title_len",
  "dimensions_normalized",
  "color_normalized",
  "price_value",
  "stock_normalized",
  "ean_normalized",
  "confidence",
  "issues",
] as const;

export default async function DebugTransformPage() {
  const { path, loadOk, loadIssues, rootWasArray, products } = await loadTransformedPartnerProducts();

  const sampleRaw = products[0]?.raw;
  let rawPreview: string;
  try {
    rawPreview =
      sampleRaw !== undefined ? JSON.stringify(sampleRaw, null, 2) : "No records to preview.";
  } catch {
    rawPreview = String(sampleRaw);
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Transform validation (temporary)</h1>
      <p style={{ marginBottom: 16 }}>
        Source: <code>{path}</code>
        {!loadOk ? (
          <>
            {" "}
            — <strong>load failed</strong>
          </>
        ) : null}
        {loadOk && !rootWasArray ? (
          <>
            {" "}
            — <strong>root is not an array</strong> (0 transformed rows)
          </>
        ) : null}
      </p>
      {loadIssues.length > 0 ? (
        <ul style={{ marginBottom: 16 }}>
          {loadIssues.map((i) => (
            <li key={i.code}>
              <code>{i.code}</code>: {i.message}
            </li>
          ))}
        </ul>
      ) : null}

      <p style={{ marginBottom: 8 }}>
        Rows: <strong>{products.length}</strong>
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead>
            <tr>
              {COLUMNS.map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p, rowIndex) => {
              const titleLen = p.allegro_title?.length ?? 0;
              return (
                <tr key={`${p.id}-${rowIndex}`}>
                  <td style={cell}>{p.original_name ?? "—"}</td>
                  <td style={cell}>{p.original_description ?? "—"}</td>
                  <td style={cell}>{p.clean_description ?? "—"}</td>
                  <td style={cell}>{p.allegro_title ?? "—"}</td>
                  <td style={cell}>{titleLen}</td>
                  <td style={cell}>{p.dimensions_normalized ?? "—"}</td>
                  <td style={cell}>{p.color_normalized ?? "—"}</td>
                  <td style={cell}>{p.price_value !== null ? String(p.price_value) : "—"}</td>
                  <td style={cell}>{p.stock_normalized ?? "—"}</td>
                  <td style={cell}>{p.ean_normalized ?? "—"}</td>
                  <td style={cell}>{p.confidence}</td>
                  <td style={{ ...cell, fontSize: 11 }}>{formatIssues(p.issues)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 8 }}>Raw JSON preview (first record)</h2>
      <pre
        style={{
          border: "1px solid #ccc",
          padding: 12,
          overflow: "auto",
          maxHeight: 400,
          fontSize: 12,
          background: "#f8f8f8",
        }}
      >
        {rawPreview}
      </pre>
    </div>
  );
}
