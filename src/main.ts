import "./style.css";
import { loadData } from "./data.ts";
import { buildCoupledChart, buildOniChart } from "./charts.ts";
import { renderDataTable, renderEventsTable, renderStatTiles } from "./ui.ts";
import { DATE_RANGE_PRESETS } from "./format.ts";
import type { EnsoEvent, MonthlyRecord } from "./types.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="page-header">
    <h1>ENSO Dashboard</h1>
    <p class="subtitle">
      Tracking El Niño / La Niña through NOAA's four operational ENSO variables --
      sea surface temperature (ONI), atmospheric pressure (SOI), subsurface heat
      content (WWV, a thermocline-depth proxy), and Pacific trade winds -- and the
      Bjerknes feedback loop that couples them.
    </p>
  </div>
  <div class="filter-row" id="filter-row">
    <span class="filter-label">Range:</span>
  </div>
  <div id="content"></div>
  <footer class="page-footer">
    Sources: NOAA CPC <a href="https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt" target="_blank" rel="noopener">ONI</a>,
    <a href="https://www.cpc.ncep.noaa.gov/data/indices/soi" target="_blank" rel="noopener">SOI</a>,
    <a href="https://www.cpc.ncep.noaa.gov/data/indices/epac850" target="_blank" rel="noopener">850mb trade wind indices</a>;
    NOAA/PMEL <a href="https://www.pmel.noaa.gov/tao/wwv/data/wwv.dat" target="_blank" rel="noopener">Warm Water Volume</a>.
    Baseline period for self-computed z-scores: 1991&ndash;2020. Full variable definitions, sourcing, and
    the El Ni&ntilde;o / Super El Ni&ntilde;o classification rule: <code>docs/data-and-definitions.md</code>.
  </footer>
`;

const filterRow = document.querySelector<HTMLDivElement>("#filter-row")!;
const content = document.querySelector<HTMLDivElement>("#content")!;

let allRecords: MonthlyRecord[] = [];
let allEvents: EnsoEvent[] = [];
let selectedPresetKey = "all";

function filteredRecords(): MonthlyRecord[] {
  const preset = DATE_RANGE_PRESETS.find((p) => p.key === selectedPresetKey)!;
  const latestDate = allRecords[allRecords.length - 1].date;
  const start = preset.startDate(latestDate);
  return start ? allRecords.filter((r) => r.date >= start) : allRecords;
}

function filteredEvents(records: MonthlyRecord[]): EnsoEvent[] {
  if (!records.length) return [];
  const first = records[0].date;
  const last = records[records.length - 1].date;
  return allEvents.filter((e) => e.endDate >= first && e.startDate <= last);
}

function renderFilterRow(): void {
  filterRow.querySelectorAll("button").forEach((b) => b.remove());
  for (const preset of DATE_RANGE_PRESETS) {
    const button = document.createElement("button");
    button.className = "filter-chip";
    button.textContent = preset.label;
    button.setAttribute("aria-pressed", String(preset.key === selectedPresetKey));
    button.addEventListener("click", () => {
      selectedPresetKey = preset.key;
      renderFilterRow();
      renderContent();
    });
    filterRow.appendChild(button);
  }
}

function renderContent(): void {
  const records = filteredRecords();
  const events = filteredEvents(records);

  content.innerHTML = `
    <div class="stat-grid" id="stat-grid"></div>

    <div class="chart-card">
      <div class="chart-card-header">
        <h2>Oceanic Ni&ntilde;o Index (ONI) &mdash; Sea Surface Temperature Anomaly</h2>
      </div>
      <p class="chart-caption">
        3-month running mean SST anomaly, Ni&ntilde;o 3.4 region. Warm (red) fill = El Ni&ntilde;o
        direction, cool (blue) fill = La Ni&ntilde;a direction. Dotted markers label the five
        Very Strong ("Super") El Ni&ntilde;o episodes since 1950.
      </p>
      <div class="chart-mount" id="oni-chart-mount"></div>
      <details>
        <summary class="table-toggle" style="display:inline-block;margin:10px 0;">View underlying monthly data as a table</summary>
        <div id="data-table-mount"></div>
      </details>
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <h2>Coupled Ocean&ndash;Atmosphere System</h2>
      </div>
      <p class="chart-caption">
        SOI, subsurface heat content, and East Pacific trade winds together &mdash; the three
        legs of the Bjerknes feedback loop besides SST. Shaded bands mark classified
        El Ni&ntilde;o (red) / La Ni&ntilde;a (blue) windows. Wind & heat-content records begin in 1979&ndash;1980.
      </p>
      <div class="legend-row">
        <span class="legend-item"><span class="swatch" style="background:var(--series-1)"></span>SOI</span>
        <span class="legend-item"><span class="swatch" style="background:var(--series-2)"></span>Heat content (WWV, z)</span>
        <span class="legend-item"><span class="swatch" style="background:var(--series-3)"></span>Trade wind, East Pacific (z)</span>
      </div>
      <div class="chart-mount" id="coupled-chart-mount"></div>
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <h2>ENSO Event Catalog</h2>
      </div>
      <p class="chart-caption">
        Episodes of &ge;5 consecutive months at |ONI| &ge; 0.5&deg;C, ranked by NOAA's strength
        tiers. "Coupled signature confirmed" means SOI, heat content, and trade winds all moved
        together in the expected direction over the episode (see <code>docs/data-and-definitions.md</code>).
      </p>
      <div id="events-table-mount"></div>
    </div>
  `;

  renderStatTiles(document.querySelector<HTMLDivElement>("#stat-grid")!, records);

  const oniMount = document.querySelector<HTMLDivElement>("#oni-chart-mount")!;
  oniMount.appendChild(buildOniChart(records, events));

  const coupledMount = document.querySelector<HTMLDivElement>("#coupled-chart-mount")!;
  coupledMount.appendChild(buildCoupledChart(records, events));

  renderEventsTable(document.querySelector<HTMLDivElement>("#events-table-mount")!, events);
  renderDataTable(document.querySelector<HTMLDivElement>("#data-table-mount")!, records);
}

async function main(): Promise<void> {
  const data = await loadData();
  allRecords = data.records;
  allEvents = data.events;
  renderFilterRow();
  renderContent();

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderContent());
}

main();
