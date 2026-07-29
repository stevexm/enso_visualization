/** Trailing rolling mean over `window` entries, skipping nulls; null where no data is in range. */
export function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  if (window <= 1) return values;
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= i; j++) {
      const v = values[j];
      if (v !== null) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

/** Trailing linear-regression slope over `window` entries ending at each index, in
 * units of (value change per step) -- e.g. °C/month for ONI. Deliberately not a raw
 * month-to-month difference: that's dominated by noise, while a short OLS fit reads
 * as the underlying trend. Null wherever the window isn't fully populated (near the
 * start of the series, or across a gap). */
export function trailingSlope(values: (number | null)[], window: number): (number | null)[] {
  const xs = Array.from({ length: window }, (_, i) => i);
  const xbar = (window - 1) / 2;
  const denom = xs.reduce((sum, x) => sum + (x - xbar) ** 2, 0);
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const windowValues = values.slice(i - window + 1, i + 1);
    if (windowValues.some((v) => v === null)) return null;
    const ys = windowValues as number[];
    const ybar = ys.reduce((a, b) => a + b, 0) / window;
    const num = xs.reduce((sum, x, j) => sum + (x - xbar) * (ys[j] - ybar), 0);
    return denom === 0 ? 0 : num / denom;
  });
}

interface SmoothableFields {
  oniAnom: number | null;
  soiStd: number | null;
  wwvZ: number | null;
  windEastZ: number | null;
}

/** Applies an extra rolling-mean window on top of the published monthly values.
 * window=1 returns the records unchanged. Only touches the fields the charts/stat
 * tiles plot -- everything else on each record passes through as-is. */
export function smoothRecords<T extends SmoothableFields>(records: T[], window: number): T[] {
  if (window <= 1) return records;
  const oni = rollingMean(records.map((r) => r.oniAnom), window);
  const soi = rollingMean(records.map((r) => r.soiStd), window);
  const wwv = rollingMean(records.map((r) => r.wwvZ), window);
  const wind = rollingMean(records.map((r) => r.windEastZ), window);
  return records.map((r, i) => ({ ...r, oniAnom: oni[i], soiStd: soi[i], wwvZ: wwv[i], windEastZ: wind[i] }));
}
