import type { EnsoEvent, MonthlyRecord } from "./types.ts";
import {
  categoryLabel,
  categoryRank,
  classifyOniReading,
  formatMonthLabel,
  formatShortMonth,
  formatSigned,
  monthsBetween,
} from "./format.ts";

function lastNonNull<K extends keyof MonthlyRecord>(records: MonthlyRecord[], key: K): MonthlyRecord | null {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i][key] !== null) return records[i];
  }
  return null;
}

function statTileHtml(label: string, valueHtml: string, meta: string): string {
  return `
    <div class="stat-tile">
      <div class="label">${label}</div>
      <div class="value">${valueHtml}</div>
      <div class="meta">${meta}</div>
    </div>`;
}

/** `oniRate` overrides the ONI tile to show the latest rate of change instead of the
 * latest level -- pass `undefined` for the normal level tile, or the trailing-slope
 * value (see trailingSlope in stats.ts) when the ONI chart's rate-of-change toggle is on. */
export function renderStatTiles(
  container: HTMLElement,
  records: MonthlyRecord[],
  oniRate?: { value: number; date: string } | null
): void {
  const latestSoiRec = lastNonNull(records, "soiStd");
  const latestWwvRec = lastNonNull(records, "wwvZ");
  const latestWindRec = lastNonNull(records, "windEastZ");

  let oniTile: string;
  if (oniRate !== undefined) {
    if (oniRate) {
      const cls = oniRate.value > 0 ? "warm" : oniRate.value < 0 ? "cool" : "";
      const label = oniRate.value > 0 ? "Warming" : oniRate.value < 0 ? "Cooling" : "Steady";
      oniTile = `
      <div class="stat-tile">
        <div class="label">Rate of change of ONI (Sea Surface Temp anomaly, Niño 3.4)</div>
        <div class="value ${cls}">${formatSigned(oniRate.value, 3)}°C/mo</div>
        <div class="badge ${cls || "neutral"}">${label}</div>
        <div class="meta">${formatMonthLabel(oniRate.date)}</div>
      </div>`;
    } else {
      oniTile = statTileHtml("Rate of change of ONI (Sea Surface Temp anomaly, Niño 3.4)", "—", "no data");
    }
  } else {
    const latestOniRec = lastNonNull(records, "oniAnom");
    if (latestOniRec) {
      const oni = latestOniRec.oniAnom as number;
      const { phase, label } = classifyOniReading(oni);
      const cls = phase === "warm" ? "warm" : phase === "cool" ? "cool" : "";
      oniTile = `
      <div class="stat-tile">
        <div class="label">ONI (Sea Surface Temp anomaly, Niño 3.4)</div>
        <div class="value ${cls}">${formatSigned(oni)}°C</div>
        <div class="badge ${phase === "neutral" ? "neutral" : cls}">${label}</div>
        <div class="meta">${formatMonthLabel(latestOniRec.date)}</div>
      </div>`;
    } else {
      oniTile = statTileHtml("ONI", "—", "no data");
    }
  }

  const soiTile = latestSoiRec
    ? statTileHtml("Southern Oscillation Index (SOI)", formatSigned(latestSoiRec.soiStd, 1), formatMonthLabel(latestSoiRec.date))
    : statTileHtml("Southern Oscillation Index (SOI)", "—", "no data");

  const wwvTile = latestWwvRec
    ? statTileHtml(
        "Heat content anomaly (WWV, z-score)",
        formatSigned(latestWwvRec.wwvZ, 2),
        formatMonthLabel(latestWwvRec.date)
      )
    : statTileHtml("Heat content anomaly (WWV, z-score)", "—", "no data");

  const windTile = latestWindRec
    ? statTileHtml(
        "Trade wind anomaly, East Pacific (z-score)",
        formatSigned(latestWindRec.windEastZ, 2),
        formatMonthLabel(latestWindRec.date)
      )
    : statTileHtml("Trade wind anomaly, East Pacific (z-score)", "—", "no data");

  container.innerHTML = oniTile + soiTile + wwvTile + windTile;
}

export type EventSortKey = "period" | "category" | "peakOni" | "peakMonth" | "onsetRate" | "confirmed";
export interface EventSortState {
  key: EventSortKey;
  dir: 1 | -1;
}

const SORT_COLUMNS: { key: EventSortKey; label: string }[] = [
  { key: "period", label: "Period" },
  { key: "category", label: "Category" },
  { key: "peakOni", label: "Peak ONI" },
  { key: "peakMonth", label: "Peak month" },
  { key: "onsetRate", label: "Onset rate" },
  { key: "confirmed", label: "Coupled signature" },
];

/** Average |°C|/month from threshold-crossing (ONI_0 = ±0.5, the onset definition) to
 * peak (see the Mean Value Theorem note in the info panel -- this average is
 * guaranteed to equal the event's actual instantaneous rate of change at some point
 * during the ramp-up). Absolute value so El Niño and La Niña onset speeds are
 * directly comparable, matching the |ONI| convention the category table already uses. */
function onsetRate(e: EnsoEvent): number {
  const months = Math.max(1, monthsBetween(e.startDate, e.peakDate));
  const onsetOni = e.phase === "el-nino" ? 0.5 : -0.5;
  return Math.abs(e.peakOni - onsetOni) / months;
}

function sortValue(e: EnsoEvent, key: EventSortKey): number | string {
  switch (key) {
    case "period":
      return e.startDate;
    case "category":
      return categoryRank(e.category);
    case "peakOni":
      return e.peakOni;
    case "peakMonth":
      return e.peakDate;
    case "onsetRate":
      return onsetRate(e);
    case "confirmed":
      return e.coupledSignature.confirmed === null ? -1 : e.coupledSignature.confirmed ? 1 : 0;
  }
}

export function renderEventsTable(container: HTMLElement, events: EnsoEvent[], sort: EventSortState): void {
  const sorted = [...events].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return cmp * sort.dir;
  });

  const rows = sorted
    .map((e) => {
      const confirmed =
        e.coupledSignature.confirmed === null
          ? '<span class="confirm-no">n/a (pre-1980)</span>'
          : e.coupledSignature.confirmed
            ? '<span class="confirm-yes">✓ confirmed</span>'
            : '<span class="confirm-no">unconfirmed</span>';
      return `
      <tr class="event-row" data-start="${e.startDate}" data-end="${e.endDate}" tabindex="0">
        <td>${formatShortMonth(e.startDate)} ${e.startDate.slice(0, 4)} – ${formatShortMonth(e.endDate)} ${e.endDate.slice(0, 4)}</td>
        <td><span class="cat-${e.category}">${categoryLabel(e.category)}</span></td>
        <td class="num cat-${e.category}">${formatSigned(e.peakOni)}°C</td>
        <td>${formatMonthLabel(e.peakDate)}</td>
        <td class="num">${onsetRate(e).toFixed(3)}°C/mo</td>
        <td>${confirmed}</td>
      </tr>`;
    })
    .join("");

  const headerCells = SORT_COLUMNS.map(({ key, label }) => {
    const active = sort.key === key;
    const arrow = active ? (sort.dir === 1 ? " ▲" : " ▼") : "";
    return `<th class="sortable${active ? " sort-active" : ""}" data-sort-key="${key}" tabindex="0" role="button" aria-sort="${active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}">${label}${arrow}</th>`;
  }).join("");

  container.innerHTML = `
    <table class="events-table">
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6">No events in this range.</td></tr>'}</tbody>
    </table>`;
}

export function renderDataTable(container: HTMLElement, records: MonthlyRecord[]): void {
  const rows = [...records]
    .reverse()
    .map(
      (r) => `
      <tr>
        <td>${formatMonthLabel(r.date)}</td>
        <td>${formatSigned(r.oniAnom)}</td>
        <td>${formatSigned(r.soiStd, 1)}</td>
        <td>${formatSigned(r.wwvZ)}</td>
        <td>${formatSigned(r.windEastZ)}</td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>ONI (°C)</th>
            <th>SOI</th>
            <th>WWV (z)</th>
            <th>Wind, East Pac (z)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
