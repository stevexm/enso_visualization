export interface MonthlyRecord {
  date: string;
  year: number;
  month: number;
  oniAnom: number | null;
  soiStd: number | null;
  wwvVolume: number | null;
  wwvAnom: number | null;
  wwvZ: number | null;
  windEastRaw: number | null;
  windEastZ: number | null;
  windCentralRaw: number | null;
  windCentralZ: number | null;
  windWestRaw: number | null;
  windWestZ: number | null;
}

export type EnsoCategory =
  | "very-strong-el-nino"
  | "strong-el-nino"
  | "moderate-el-nino"
  | "weak-el-nino"
  | "neutral"
  | "weak-la-nina"
  | "moderate-la-nina"
  | "strong-la-nina"
  | "very-strong-la-nina";

export interface EnsoEvent {
  phase: "el-nino" | "la-nina";
  category: EnsoCategory;
  startDate: string;
  endDate: string;
  peakDate: string;
  peakOni: number;
  durationMonths: number;
  coupledSignature: {
    meanSoiStd: number | null;
    meanWwvZ: number | null;
    meanWindEastZ: number | null;
    confirmed: boolean | null;
  };
}

export interface DateRangePreset {
  key: string;
  label: string;
  /** returns the inclusive start date "YYYY-MM", or null for "all time" */
  startDate(latestDate: string): string | null;
}
