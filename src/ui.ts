import type { EnsoEvent, MonthlyRecord } from "./types.ts";
import { categoryLabel, classifyOniReading, formatMonthLabel, formatShortMonth, formatSigned } from "./format.ts";

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

export function renderStatTiles(container: HTMLElement, records: MonthlyRecord[]): void {
  const latestOniRec = lastNonNull(records, "oniAnom");
  const latestSoiRec = lastNonNull(records, "soiStd");
  const latestWwvRec = lastNonNull(records, "wwvZ");
  const latestWindRec = lastNonNull(records, "windEastZ");

  let oniTile: string;
  if (latestOniRec) {
    const oni = latestOniRec.oniAnom as number;
    const { phase, label } = classifyOniReading(oni);
    const cls = phase === "warm" ? "warm" : phase === "cool" ? "cool" : "";
    oniTile = `
    <div class="stat-tile">
      <div class="label">Latest ONI (SST anomaly, Niño 3.4)</div>
      <div class="value ${cls}">${formatSigned(oni)}°C</div>
      <div class="badge ${phase === "neutral" ? "neutral" : cls}">${label}</div>
      <div class="meta">${formatMonthLabel(latestOniRec.date)}</div>
    </div>`;
  } else {
    oniTile = statTileHtml("Latest ONI", "—", "no data");
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

export function renderEventsTable(container: HTMLElement, events: EnsoEvent[]): void {
  const rows = [...events]
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
    .map((e) => {
      const confirmed =
        e.coupledSignature.confirmed === null
          ? '<span class="confirm-no">n/a (pre-1980)</span>'
          : e.coupledSignature.confirmed
            ? '<span class="confirm-yes">✓ confirmed</span>'
            : '<span class="confirm-no">unconfirmed</span>';
      return `
      <tr>
        <td>${formatShortMonth(e.startDate)} ${e.startDate.slice(0, 4)} – ${formatShortMonth(e.endDate)} ${e.endDate.slice(0, 4)}</td>
        <td>${categoryLabel(e.category)}</td>
        <td class="num">${formatSigned(e.peakOni)}°C</td>
        <td>${formatMonthLabel(e.peakDate)}</td>
        <td>${confirmed}</td>
      </tr>`;
    })
    .join("");

  container.innerHTML = `
    <table class="events-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Category</th>
          <th>Peak ONI</th>
          <th>Peak month</th>
          <th>Coupled signature</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5">No events in this range.</td></tr>'}</tbody>
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
