import type { EnsoCategory, EnsoEvent, MonthlyRecord } from "./types.ts";

const EL_NINO_ONSET = 0.5;
const LA_NINA_ONSET = -0.5;
const MIN_CONSECUTIVE_MONTHS = 5;

function categoryFor(phase: "el-nino" | "la-nina", peakOni: number): EnsoCategory {
  const magnitude = Math.abs(peakOni);
  const strength =
    magnitude >= 2.0 ? "very-strong" : magnitude >= 1.5 ? "strong" : magnitude >= 1.0 ? "moderate" : "weak";
  return `${strength}-${phase === "el-nino" ? "el-nino" : "la-nina"}` as EnsoCategory;
}

function mean(values: (number | null)[]): number | null {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return finite.length ? finite.reduce((sum, v) => sum + v, 0) / finite.length : null;
}

/**
 * Finds El Nino / La Nina events using NOAA's own operational rule (ONI at
 * or beyond +-0.5 deg C for at least 5 consecutive overlapping seasons),
 * then attaches a Bjerknes-feedback "coupled signature" (see
 * docs/data-and-definitions.md for sourcing): during a real El Nino the
 * trade winds should be weak, the heat-content anomaly positive, and the
 * SOI negative, all at once. An event
 * whose ONI crosses the threshold but whose other three legs don't move
 * together is flagged unconfirmed rather than dropped, since ONI is a
 * single-region SST read and can occasionally decouple from the rest of the
 * system.
 */
export function findEnsoEvents(records: MonthlyRecord[]): EnsoEvent[] {
  const events: EnsoEvent[] = [];
  let i = 0;

  while (i < records.length) {
    const oni = records[i].oniAnom;
    if (oni === null) {
      i++;
      continue;
    }

    const phase: "el-nino" | "la-nina" | null =
      oni >= EL_NINO_ONSET ? "el-nino" : oni <= LA_NINA_ONSET ? "la-nina" : null;

    if (!phase) {
      i++;
      continue;
    }

    let j = i;
    while (
      j < records.length &&
      records[j].oniAnom !== null &&
      (phase === "el-nino" ? (records[j].oniAnom as number) >= EL_NINO_ONSET : (records[j].oniAnom as number) <= LA_NINA_ONSET)
    ) {
      j++;
    }

    const runLength = j - i;
    if (runLength >= MIN_CONSECUTIVE_MONTHS) {
      const window = records.slice(i, j);
      const peakRecord = window.reduce((peak, r) =>
        phase === "el-nino"
          ? (r.oniAnom as number) > (peak.oniAnom as number) ? r : peak
          : (r.oniAnom as number) < (peak.oniAnom as number) ? r : peak
      );

      const meanSoiStd = mean(window.map((r) => r.soiStd));
      const meanWwvZ = mean(window.map((r) => r.wwvZ));
      const meanWindEastZ = mean(window.map((r) => r.windEastZ));

      const allCorroboratorsPresent = meanSoiStd !== null && meanWwvZ !== null && meanWindEastZ !== null;
      const confirmed = allCorroboratorsPresent
        ? phase === "el-nino"
          ? meanSoiStd! < 0 && meanWwvZ! > 0 && meanWindEastZ! < 0
          : meanSoiStd! > 0 && meanWwvZ! < 0 && meanWindEastZ! > 0
        : null;

      events.push({
        phase,
        category: categoryFor(phase, peakRecord.oniAnom as number),
        startDate: window[0].date,
        endDate: window[window.length - 1].date,
        peakDate: peakRecord.date,
        peakOni: peakRecord.oniAnom as number,
        durationMonths: runLength,
        coupledSignature: { meanSoiStd, meanWwvZ, meanWindEastZ, confirmed },
      });
    }

    i = j;
  }

  return events;
}
