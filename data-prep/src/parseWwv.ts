import fs from "node:fs";
import type { MonthlyPoint } from "./types.ts";

export interface WwvSeries {
  volume: MonthlyPoint[];
  anomaly: MonthlyPoint[];
}

/** Parses PMEL's wwv.dat (Warm Water Volume, 5N-5S 120E-80W) -- subsurface heat content proxy. */
export function parseWwv(rawPath: string): WwvSeries {
  const lines = fs.readFileSync(rawPath, "utf8").split(/\r?\n/);
  const volume: MonthlyPoint[] = [];
  const anomaly: MonthlyPoint[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3 || !/^\d{6}$/.test(parts[0])) continue;

    const yyyymm = parts[0];
    const date = `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
    const vol = Number(parts[1]);
    const anom = Number(parts[2]);
    if (!Number.isFinite(vol) || !Number.isFinite(anom)) continue;

    volume.push({ date, value: vol });
    anomaly.push({ date, value: anom });
  }

  return { volume, anomaly };
}
