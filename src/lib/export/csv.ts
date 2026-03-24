/**
 * RFC 4180–style CSV with deterministic quoting. Suitable for ops exports.
 */
export function rowsToCsv(rows: string[][]): string {
  const esc = (cell: string) => {
    if (/[",\r\n]/.test(cell)) {
      return `"${cell.replaceAll('"', '""')}"`;
    }
    return cell;
  };
  return rows.map((row) => row.map(esc).join(",")).join("\r\n");
}
