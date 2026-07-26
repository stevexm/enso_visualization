export interface MonthlyPoint {
  /** "YYYY-MM", always the 1st of the month, UTC */
  date: string;
  value: number;
}

export interface MonthlyRecord {
  date: string;
  year: number;
  month: number;
  /** ONI: SST anomaly in the Nino 3.4 region (deg C), NOAA's official ENSO index */
  oniAnom: number | null;
  /** SOI: standardized (Tahiti - Darwin) sea level pressure difference */
  soiStd: number | null;
  /** Warm Water Volume: raw volume, m^3 (5N-5S, 120E-80W) -- subsurface heat content / thermocline proxy */
  wwvVolume: number | null;
  /** WWV anomaly as published by PMEL, m^3 */
  wwvAnom: number | null;
  /** WWV anomaly expressed as a z-score against the 1991-2020 baseline */
  wwvZ: number | null;
  /** 850mb trade wind index, east Pacific (135W-120W, 5N-5S), m/s */
  windEastRaw: number | null;
  /** East Pacific trade wind anomaly z-score vs 1991-2020 monthly climatology */
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
  /** mean corroborating anomalies across the event window, when data is available */
  coupledSignature: {
    meanSoiStd: number | null;
    meanWwvZ: number | null;
    meanWindEastZ: number | null;
    /** true when SOI/WWV/wind all move in the direction implied by the Bjerknes feedback for this phase */
    confirmed: boolean | null;
  };
}
