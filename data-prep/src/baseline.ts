import type { MonthlyPoint } from "./types.ts";

/** NOAA's current climate-normal period; used to baseline WWV and trade-wind indices. */
export const BASELINE_START_YEAR = 1991;
export const BASELINE_END_YEAR = 2020;

function isInBaseline(date: string): boolean {
  const year = Number(date.slice(0, 4));
  return year >= BASELINE_START_YEAR && year <= BASELINE_END_YEAR;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sampleStd(values: number[], m: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

/**
 * Converts a raw monthly series into z-scores against its own 1991-2020
 * baseline, matched calendar-month by calendar-month (so a January value
 * is compared only against other Januaries) -- this removes the seasonal
 * cycle, isolating the anomaly the same way NOAA's own indices do.
 */
export function toMonthlyClimatologyZScore(points: MonthlyPoint[]): MonthlyPoint[] {
  const byCalendarMonth = new Map<number, number[]>();
  for (const p of points) {
    if (!isInBaseline(p.date)) continue;
    const calMonth = Number(p.date.slice(5, 7));
    const bucket = byCalendarMonth.get(calMonth) ?? [];
    bucket.push(p.value);
    byCalendarMonth.set(calMonth, bucket);
  }

  const stats = new Map<number, { mean: number; std: number }>();
  for (const [calMonth, values] of byCalendarMonth) {
    const m = mean(values);
    stats.set(calMonth, { mean: m, std: sampleStd(values, m) });
  }

  return points
    .map((p) => {
      const calMonth = Number(p.date.slice(5, 7));
      const stat = stats.get(calMonth);
      if (!stat || stat.std === 0) return null;
      return { date: p.date, value: (p.value - stat.mean) / stat.std };
    })
    .filter((p): p is MonthlyPoint => p !== null);
}
