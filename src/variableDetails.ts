export type CoupledSeriesKey = "soi" | "wwv" | "wind";

export interface VariableDetail {
  name: string;
  /** LaTeX for the formula this project actually computes for this variable, or
   * null when none is computed here (e.g. SOI arrives pre-standardized from NOAA). */
  formula: string | null;
  description: string;
}

const Z_SCORE_TEX = "z_{y,m} = \\dfrac{x_{y,m} - \\mu_m}{\\sigma_m}";

export const VARIABLE_DETAILS: Record<CoupledSeriesKey, VariableDetail> = {
  soi: {
    name: "Southern Oscillation Index (SOI)",
    formula: null,
    description:
      "This is NOAA CPC's own standardized Tahiti-minus-Darwin sea-level-pressure difference, used as published -- this project doesn't compute anything additional for SOI.",
  },
  wwv: {
    name: "Heat content anomaly (WWV, z-score)",
    formula: Z_SCORE_TEX,
    description:
      "The raw value is PMEL's published Warm Water Volume anomaly (m³). The mean and standard deviation are computed per calendar month over the 1991–2020 baseline, so a June is only ever compared against other Junes.",
  },
  wind: {
    name: "Trade wind anomaly, East Pacific (z-score)",
    formula: Z_SCORE_TEX,
    description:
      "The raw value is CPC's published 850mb East Pacific trade-wind index (m/s), standardized the same way -- per calendar month, over 1991–2020.",
  },
};
