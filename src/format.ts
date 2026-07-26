import type { DateRangePreset, EnsoCategory } from "./types.ts";

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatMonthLabel(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatShortMonth(date: string): string {
  const [, month] = date.split("-").map(Number);
  return MONTH_NAMES[month - 1];
}

export function formatSigned(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

const CATEGORY_LABEL: Record<EnsoCategory, string> = {
  "very-strong-el-nino": "Very Strong (Super) El Niño",
  "strong-el-nino": "Strong El Niño",
  "moderate-el-nino": "Moderate El Niño",
  "weak-el-nino": "Weak El Niño",
  neutral: "Neutral (ENSO-neutral)",
  "weak-la-nina": "Weak La Niña",
  "moderate-la-nina": "Moderate La Niña",
  "strong-la-nina": "Strong La Niña",
  "very-strong-la-nina": "Very Strong La Niña",
};

export function categoryLabel(category: EnsoCategory): string {
  return CATEGORY_LABEL[category];
}

/** Classifies a single ONI reading using the same tiers as data-prep/src/classify.ts,
 * for display purposes only (doesn't require the 5-consecutive-month run). */
export function classifyOniReading(oni: number): { phase: "warm" | "cool" | "neutral"; label: string } {
  const magnitude = Math.abs(oni);
  if (magnitude < 0.5) return { phase: "neutral", label: "Neutral" };
  const strength = magnitude >= 2.0 ? "Very Strong" : magnitude >= 1.5 ? "Strong" : magnitude >= 1.0 ? "Moderate" : "Weak";
  return oni > 0
    ? { phase: "warm", label: `${strength} El Niño${magnitude >= 2 ? " (Super)" : ""} range` }
    : { phase: "cool", label: `${strength} La Niña range` };
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { key: "all", label: "All (1950–present)", startDate: () => null },
  {
    key: "since-1980",
    label: "Since 1980 (full coupled data)",
    startDate: () => "1980-01",
  },
  {
    key: "30y",
    label: "Last 30 years",
    startDate: (latest) => shiftYears(latest, -30),
  },
  {
    key: "10y",
    label: "Last 10 years",
    startDate: (latest) => shiftYears(latest, -10),
  },
];

function shiftYears(date: string, years: number): string {
  const [year, month] = date.split("-").map(Number);
  return `${year + years}-${String(month).padStart(2, "0")}`;
}
