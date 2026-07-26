import fs from "node:fs";
import type { MonthlyPoint } from "./types.ts";

const MISSING = -999.9;

/**
 * NOAA CPC's year-by-month tables pack each value into a fixed 6-char field
 * after a 4-char year, with no guaranteed space between adjacent fields
 * (e.g. "...-1.4-999.9..."), so this must slice by column rather than split
 * on whitespace.
 */
function parseYearRow(line: string): { year: number; values: number[] } | null {
  if (!/^\d{4}/.test(line)) return null;
  const year = Number(line.slice(0, 4));
  const values: number[] = [];
  for (let i = 0; i < 12; i++) {
    const field = line.slice(4 + i * 6, 4 + i * 6 + 6).trim();
    values.push(field === "" ? MISSING : Number(field));
  }
  return { year, values };
}

/**
 * Parses the Nth (1-indexed) "YEAR JAN FEB ... DEC" table in a NOAA CPC
 * fixed-width indices file (several of these files stack multiple tables,
 * e.g. raw anomaly then standardized, in one document).
 */
export function parseNthYearTable(rawPath: string, tableIndex: number): MonthlyPoint[] {
  const lines = fs.readFileSync(rawPath, "utf8").split(/\r?\n/);
  const headerLineNumbers = lines
    .map((line, i) => (/^YEAR\s+JAN/.test(line) ? i : -1))
    .filter((i) => i !== -1);

  const startLine = headerLineNumbers[tableIndex - 1];
  if (startLine === undefined) {
    throw new Error(`${rawPath}: expected at least ${tableIndex} "YEAR JAN..." table(s)`);
  }
  const endLine = headerLineNumbers[tableIndex] ?? lines.length;

  const points: MonthlyPoint[] = [];
  for (const line of lines.slice(startLine + 1, endLine)) {
    const row = parseYearRow(line);
    if (!row) continue;
    row.values.forEach((value, monthIndex) => {
      if (value === MISSING) return;
      const month = String(monthIndex + 1).padStart(2, "0");
      points.push({ date: `${row.year}-${month}`, value });
    });
  }
  return points;
}
