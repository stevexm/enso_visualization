export interface PeriodogramPoint {
  periodYears: number;
  power: number;
  /** The AR1 red-noise background level at this frequency, *unscaled* by any
   * confidence level -- see `applyConfidence`, which turns this into a threshold. */
  redNoise: number;
}

export interface SignificancePoint extends PeriodogramPoint {
  /** `redNoise` scaled to a specific confidence level's chi-square(2) bound -- what
   * this point's power would need to exceed to count as more than noise at that
   * confidence. See `applyConfidence`. */
  threshold: number;
}

export interface DominantMode {
  periodYears: number;
  power: number;
}

/** Lag-1 (month-to-month) autocorrelation of a demeaned series -- the "redness" of
 * the noise, used below to build the null spectrum a real peak has to clear. */
function lag1Autocorrelation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) den += (values[i] - mean) ** 2;
  for (let i = 0; i < values.length - 1; i++) num += (values[i] - mean) * (values[i + 1] - mean);
  return den === 0 ? 0 : num / den;
}

export type WindowType = "rectangular" | "hann" | "welch" | "tukey";

// Tukey's taper fraction -- the outer 25% on each side fades (cosine-shaped, like
// Hann's), the middle 50% stays flat at full weight. A fixed, standard default
// (matching e.g. SciPy's), sitting deliberately between Welch/Hann's full-length
// taper and rectangular's none at all.
const TUKEY_ALPHA = 0.5;

/** Per-sample taper weights, 0..1. Rectangular is the no-op case (every sample kept
 * at full weight, i.e. today's default) -- Hann, Welch, and Tukey fade the ends
 * toward zero to reduce spectral leakage, at the cost of frequency resolution (see
 * the info panel / chat for the full explanation). */
function windowWeights(type: WindowType, n: number): number[] {
  if (type === "rectangular") return new Array(n).fill(1);
  if (type === "hann") return Array.from({ length: n }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))));
  if (type === "welch") {
    // A parabolic (not cosine) taper -- gentler than Hann near the edges.
    const half = (n - 1) / 2;
    return Array.from({ length: n }, (_, i) => 1 - ((i - half) / half) ** 2);
  }
  // Tukey: flat in the middle, Hann-shaped cosine taper only on the outer edges.
  const edge = (TUKEY_ALPHA * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => {
    if (i < edge) return 0.5 * (1 + Math.cos(Math.PI * (i / edge - 1)));
    if (i > n - 1 - edge) return 0.5 * (1 + Math.cos(Math.PI * ((i - (n - 1 - edge)) / edge)));
    return 1;
  });
}

/** A basic DFT periodogram (O(n^2) is plenty at ~900 monthly points -- no FFT
 * dependency needed) plus its red-noise (AR1) background -- the null spectrum a real
 * peak has to clear, at whatever confidence level the caller picks (see
 * `applyConfidence`). This is the standard climate-time-series approach (Gilman et
 * al. 1963; the chi-square/AR1 formulation as in Torrence & Compo 1998 eq. 16-18):
 * each periodogram ordinate is asymptotically chi-square distributed with 2 degrees
 * of freedom under the null hypothesis.
 *
 * `values` must be a complete, evenly-spaced (monthly), null-free series. Split from
 * `applyConfidence` so a confidence-level slider can recompute cheaply (an O(n) scale
 * + peak scan) without redoing the O(n^2) transform on every drag event -- changing
 * `window` does need a re-transform, but even the full O(n^2) DFT is well under a
 * frame at this size, so it's fine to call straight from a button click. */
export function computePeriodogram(values: number[], window: WindowType = "rectangular"): PeriodogramPoint[] {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const demeaned = values.map((v) => v - mean);
  // Lag-1 autocorrelation is a property of the underlying data, not of whatever
  // window we're about to analyze it through -- estimate it before tapering.
  const r1 = lag1Autocorrelation(demeaned);

  const w = windowWeights(window, n);
  const x = demeaned.map((v, i) => v * w[i]);
  const dtYears = 1 / 12;

  const raw: { periodYears: number; power: number }[] = [];
  for (let k = 1; k <= Math.floor(n / 2); k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      re += x[t] * Math.cos(angle);
      im += x[t] * Math.sin(angle);
    }
    const power = (2 / n) * (re * re + im * im);
    raw.push({ periodYears: n * dtYears / k, power });
  }

  // Red-noise (AR1) null spectrum, Torrence & Compo 1998 eq. 16 -- scaled so its mean
  // matches the actual (possibly windowed) periodogram's mean, since only the *shape*
  // of the null model is theoretical; its overall level has to be calibrated to
  // whatever this specific transform actually produced.
  const redShape = raw.map((_, i) => {
    const k = i + 1;
    return (1 - r1 * r1) / (1 - 2 * r1 * Math.cos((2 * Math.PI * k) / n) + r1 * r1);
  });
  const meanPower = raw.reduce((a, d) => a + d.power, 0) / raw.length;
  const meanRedShape = redShape.reduce((a, v) => a + v, 0) / redShape.length;

  return raw.map((d, i) => ({ ...d, redNoise: (redShape[i] / meanRedShape) * meanPower }));
}

/** Scales each point's red-noise background to a significance threshold at the given
 * `confidence` (e.g. 0.95) -- the chi-square(2 dof) quantile, halved (Torrence &
 * Compo eq. 18): -ln(1-confidence). Higher confidence -> higher bar -> fewer, more
 * certain dominant modes; lower confidence -> the threshold drops and more of the
 * raw periodogram's bumps clear it. */
export function applyConfidence(periodogram: PeriodogramPoint[], confidence: number): SignificancePoint[] {
  const chiSquareFactor = -Math.log(1 - confidence);
  return periodogram.map((p) => ({ ...p, threshold: p.redNoise * chiSquareFactor }));
}

/** Local maxima of the periodogram that clear the red-noise significance threshold --
 * "dominant mode" means both "a peak" and "probably not just noise," not either alone.
 * Sorted by power descending, capped at `maxModes` so the chart doesn't get cluttered
 * by a long tail of barely-significant bumps. */
export function findDominantModes(periodogram: SignificancePoint[], maxModes = 6): DominantMode[] {
  const peaks: DominantMode[] = [];
  for (let i = 0; i < periodogram.length; i++) {
    const p = periodogram[i];
    if (p.power <= p.threshold) continue;
    const prev = periodogram[i - 1];
    const next = periodogram[i + 1];
    if (prev && p.power <= prev.power) continue;
    if (next && p.power <= next.power) continue;
    peaks.push({ periodYears: p.periodYears, power: p.power });
  }
  return peaks.sort((a, b) => b.power - a.power).slice(0, maxModes);
}
