import fs from "node:fs";
import type { MonthlyPoint } from "./types.ts";

// NOAA CPC labels each overlapping 3-month season by its middle month.
// YR in the source file is the year of that middle month (so "NDJ 1950"
// means Dec 1950, i.e. YR applies to the Dec, and the trailing Jan is YR+1).
const SEASON_CENTER_MONTH: Record<string, number> = {
  DJF: 1,
  JFM: 2,
  FMA: 3,
  MAM: 4,
  AMJ: 5,
  MJJ: 6,
  JJA: 7,
  JAS: 8,
  ASO: 9,
  SON: 10,
  OND: 11,
  NDJ: 12,
};

/** Parses NOAA CPC's oni.ascii.txt into a monthly SST-anomaly series (Nino 3.4 region). */
export function parseOni(rawPath: string): MonthlyPoint[] {
  const lines = fs.readFileSync(rawPath, "utf8").split(/\r?\n/);
  const points: MonthlyPoint[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 4) continue;
    const [seas, yrStr, , anomStr] = parts;
    const month = SEASON_CENTER_MONTH[seas];
    if (!month) continue;

    const year = Number(yrStr);
    const anom = Number(anomStr);
    if (!Number.isFinite(year) || !Number.isFinite(anom)) continue;

    points.push({ date: `${year}-${String(month).padStart(2, "0")}`, value: anom });
  }

  return points;
}
