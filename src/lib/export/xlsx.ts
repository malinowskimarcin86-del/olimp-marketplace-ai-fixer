import * as XLSX from "xlsx";

export type SheetMatrix = (string | number | boolean | null)[][];

/**
 * Builds a minimal workbook from a single sheet matrix (header row first).
 */
export function matrixToXlsxBuffer(matrix: SheetMatrix, sheetName = "Export"): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
