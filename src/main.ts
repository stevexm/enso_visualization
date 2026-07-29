import "./style.css";
import "katex/dist/katex.min.css";
import { loadData } from "./data.ts";
import {
  ALL_SERIES_VISIBLE,
  buildCoupledChart,
  buildFrequencyChart,
  buildOniChart,
  buildRegionMap,
  type CoupledSeriesVisibility,
} from "./charts.ts";
import { renderDataTable, renderEventsTable, renderStatTiles, type EventSortKey, type EventSortState } from "./ui.ts";
import { DATE_RANGE_PRESETS, formatMonthLabel } from "./format.ts";
import { smoothRecords, trailingSlope } from "./stats.ts";
import {
  applyConfidence,
  computePeriodogram,
  findDominantModes,
  type PeriodogramPoint,
  type WindowType,
} from "./frequency.ts";
import { createDualRangeSlider, type DualRangeSlider } from "./rangeSlider.ts";
import { renderMath } from "./math.ts";
import { VARIABLE_DETAILS, type CoupledSeriesKey } from "./variableDetails.ts";
import type { EnsoEvent, MonthlyRecord } from "./types.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;

const THEME_STORAGE_KEY = "enso-theme";

function currentTheme(): "light" | "dark" {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", theme);
}

app.innerHTML = `
  <div class="page-header">
    <div>
      <h1>ENSO Dashboard</h1>
      <p class="subtitle">
        Tracking El Niño / La Niña through NOAA's four operational ENSO variables --
        sea surface temperature (ONI), atmospheric pressure (SOI), subsurface heat
        content (WWV, a thermocline-depth proxy), and Pacific trade winds -- and the
        Bjerknes feedback loop that couples them.
      </p>
    </div>
    <button class="theme-toggle" id="theme-toggle" type="button"></button>
  </div>
  <div class="controls-bar">
    <label class="filter-label" for="smoothing-slider">Smoothing:</label>
    <input type="range" id="smoothing-slider" min="1" max="12" step="1" value="1" />
    <span id="smoothing-value"></span>
    <span class="controls-bar-note">Display-only -- doesn't change the event catalog.</span>
  </div>
  <div id="content"></div>
  <footer class="page-footer">
    Sources: NOAA CPC <a href="https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt" target="_blank" rel="noopener">ONI</a>,
    <a href="https://www.cpc.ncep.noaa.gov/data/indices/soi" target="_blank" rel="noopener">SOI</a>,
    <a href="https://www.cpc.ncep.noaa.gov/data/indices/epac850" target="_blank" rel="noopener">850mb trade wind indices</a>;
    NOAA/PMEL <a href="https://www.pmel.noaa.gov/tao/wwv/data/wwv.dat" target="_blank" rel="noopener">Warm Water Volume</a>.
    Baseline period for self-computed z-scores: 1991&ndash;2020. All four series are monthly composites --
    none of these NOAA/PMEL sources publish a daily or weekly version of these specific
    indices. Full variable definitions, sourcing, and
    the El Ni&ntilde;o / Super El Ni&ntilde;o classification rule: <code>docs/definitions.md</code>.
  </footer>
`;

const content = document.querySelector<HTMLDivElement>("#content")!;

let allRecords: MonthlyRecord[] = [];
let allEvents: EnsoEvent[] = [];
let selectedPresetKey = "all";
let smoothingWindow = 1;

// Index-based window over allRecords -- lets the slider land on *any* [start, end]
// pair, not just "last N years to present" like the preset chips.
let rangeStartIdx = 0;
let rangeEndIdx = 0;

// Which coupled-chart series are shown -- click a legend item to hide/show it;
// isolating one also zooms the y-axis to it (see buildCoupledChart).
let visibleSeries: CoupledSeriesVisibility = { ...ALL_SERIES_VISIBLE };

// Event catalog sort -- matches the table's old fixed order (most recent first).
let eventSort: EventSortState = { key: "period", dir: -1 };

// ONI chart rate-of-change toggle -- plots a trailing slope instead of the level.
let oniRateMode = false;

// Frequency analysis -- the DFT itself is a whole-record analysis, not tied to the
// zoom/smoothing controls the other charts respond to. `oniSeries` is cached once
// data loads so switching the window (which needs a re-transform) doesn't need to
// re-derive it from allRecords each time. The confidence level is cheaper to change
// (a scale + peak scan, no re-transform), so it's a slider rather than a button row.
let oniSeries: number[] = [];
let oniPeriodogram: PeriodogramPoint[] = [];
let freqConfidence = 0.95;
let freqWindow: WindowType = "rectangular";

function smoothingLabel(window: number): string {
  return window === 1 ? "1 month (published values, no extra smoothing)" : `${window}-month rolling average`;
}

function filteredRecords(): MonthlyRecord[] {
  return allRecords.slice(rangeStartIdx, rangeEndIdx + 1);
}

function filteredEvents(records: MonthlyRecord[]): EnsoEvent[] {
  if (!records.length) return [];
  const first = records[0].date;
  const last = records[records.length - 1].date;
  return allEvents.filter((e) => e.endDate >= first && e.startDate <= last);
}

/** Sets the active window from a date pair (used by both preset chips and clicking
 * an event row) and refreshes everything that displays the current range. */
function setRangeByDate(startDate: string | null, endDate: string, presetKey: string): void {
  selectedPresetKey = presetKey;
  rangeStartIdx = startDate ? Math.max(0, allRecords.findIndex((r) => r.date >= startDate)) : 0;
  rangeEndIdx = Math.max(rangeStartIdx, allRecords.findLastIndex((r) => r.date <= endDate));
  rangeSlider?.setRange(rangeStartIdx, rangeEndIdx);
  updateRangeLabel();
  updateFilterChips();
  renderContent();
}

function updateFilterChips(): void {
  document.querySelectorAll<HTMLButtonElement>(".filter-chip").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.presetKey === selectedPresetKey));
  });
}

function initFilterChips(): void {
  const filterRow = document.querySelector<HTMLDivElement>("#filter-row")!;
  for (const preset of DATE_RANGE_PRESETS) {
    const button = document.createElement("button");
    button.className = "filter-chip";
    button.textContent = preset.label;
    button.dataset.presetKey = preset.key;
    button.setAttribute("aria-pressed", String(preset.key === selectedPresetKey));
    button.addEventListener("click", () => {
      const latestDate = allRecords[allRecords.length - 1].date;
      setRangeByDate(preset.startDate(latestDate), latestDate, preset.key);
    });
    filterRow.appendChild(button);
  }
}

function shiftMonths(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Click (or Enter/Space) an event row to zoom the whole dashboard to that period,
 * padded a year on each side so you can see the build-up and decay around it, not
 * just the bare qualifying window. Delegated on the mount div, which persists across
 * re-renders even though `renderEventsTable` replaces the rows inside it every time. */
function initEventsTableClick(): void {
  const mount = document.querySelector<HTMLDivElement>("#events-table-mount")!;
  const zoomToRow = (row: HTMLElement) => {
    const start = row.dataset.start;
    const end = row.dataset.end;
    if (!start || !end) return;
    setRangeByDate(shiftMonths(start, -12), shiftMonths(end, 12), "custom");
  };
  const sortByHeader = (th: HTMLElement) => {
    const key = th.dataset.sortKey as EventSortKey | undefined;
    if (!key) return;
    eventSort = key === eventSort.key ? { key, dir: eventSort.dir === 1 ? -1 : 1 } : { key, dir: -1 };
    renderEventsTableOnly();
  };
  mount.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>(".event-row");
    if (row) return zoomToRow(row);
    const th = target.closest<HTMLElement>("th[data-sort-key]");
    if (th) sortByHeader(th);
  });
  mount.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>(".event-row");
    if (row) {
      e.preventDefault();
      return zoomToRow(row);
    }
    const th = target.closest<HTMLElement>("th[data-sort-key]");
    if (th) {
      e.preventDefault();
      sortByHeader(th);
    }
  });
}

/** "info" and "view events" toggle independently -- plain buttons + hidden panels,
 * not native <details>, so an expanded panel's width (the events table can be wide)
 * never fights the other button for space in the row above it. */
function initInfoToggles(): void {
  const toggles: [string, string][] = [
    ["toggle-bjerknes", "panel-bjerknes"],
    ["toggle-events", "panel-events"],
    ["toggle-oni-info", "panel-oni-info"],
    ["toggle-freq-info", "panel-freq-info"],
  ];
  for (const [buttonId, panelId] of toggles) {
    const button = document.querySelector<HTMLButtonElement>(`#${buttonId}`);
    const panel = document.querySelector<HTMLElement>(`#${panelId}`);
    button?.addEventListener("click", () => {
      if (!panel) return;
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
    });
  }
}

// --- Custom period slider (built once; only its position is updated afterward,
// so an in-progress drag never has its own DOM ripped out from under it). ---
let rangeSlider: DualRangeSlider | null = null;
let renderScheduled = false;

function updateRangeLabel(): void {
  const label = document.querySelector<HTMLSpanElement>("#range-slider-label");
  if (!label || !allRecords.length) return;
  label.textContent = `${formatMonthLabel(allRecords[rangeStartIdx].date)} – ${formatMonthLabel(allRecords[rangeEndIdx].date)}`;
}

function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderContent();
  });
}

function initRangeSlider(): void {
  const mount = document.querySelector<HTMLDivElement>("#range-slider")!;
  rangeSlider = createDualRangeSlider(mount, {
    min: 0,
    max: allRecords.length - 1,
    start: rangeStartIdx,
    end: rangeEndIdx,
    formatIndex: (i) => formatMonthLabel(allRecords[i].date),
    onChange: (start, end) => {
      rangeStartIdx = start;
      rangeEndIdx = end;
      selectedPresetKey = "custom"; // no preset chip matches an arbitrary drag
      updateRangeLabel();
      updateFilterChips();
      scheduleRender();
    },
  });
  updateRangeLabel();
}

// --- Clickable legend on the coupled chart: toggle a series on/off, or isolate
// one to see its zoomed-in line plus its formula/definition below the legend. ---
const SERIES_KEYS: CoupledSeriesKey[] = ["soi", "wwv", "wind"];

function updateLegendButtons(): void {
  for (const key of SERIES_KEYS) {
    const button = document.querySelector<HTMLButtonElement>(`.legend-item[data-series="${key}"]`);
    if (!button) continue;
    button.setAttribute("aria-pressed", String(visibleSeries[key]));
    button.classList.toggle("legend-item-hidden", !visibleSeries[key]);
  }
}

function renderVariableDetail(): void {
  const container = document.querySelector<HTMLDivElement>("#variable-detail");
  if (!container) return;

  const focused = SERIES_KEYS.filter((key) => visibleSeries[key]);
  if (focused.length === 0) {
    container.innerHTML = `<p class="variable-detail-empty">No variables selected -- click one above, or <button type="button" id="legend-show-all" class="link-button">show all</button>.</p>`;
    document.querySelector<HTMLButtonElement>("#legend-show-all")?.addEventListener("click", () => {
      visibleSeries = { ...ALL_SERIES_VISIBLE };
      renderCoupledChartOnly();
    });
    return;
  }
  if (focused.length > 1) {
    container.innerHTML = "";
    return;
  }

  const detail = VARIABLE_DETAILS[focused[0]];
  container.innerHTML = `
    <div class="variable-detail-card">
      <div class="variable-detail-name">${detail.name}</div>
      ${detail.formula ? `<div class="variable-detail-formula">${renderMath(detail.formula, true)}</div>` : ""}
      <p class="variable-detail-desc">${detail.description}</p>
    </div>`;
}

function initLegend(): void {
  for (const key of SERIES_KEYS) {
    const button = document.querySelector<HTMLButtonElement>(`.legend-item[data-series="${key}"]`);
    button?.addEventListener("click", () => {
      visibleSeries = { ...visibleSeries, [key]: !visibleSeries[key] };
      renderCoupledChartOnly();
    });
  }
  document.querySelector<HTMLButtonElement>("#legend-show-all-static")?.addEventListener("click", () => {
    visibleSeries = { ...ALL_SERIES_VISIBLE };
    renderCoupledChartOnly();
  });
}

const ONI_RUNNING_MEAN_TEX = "\\mathrm{ONI}_t = \\frac{1}{3}\\sum_{k=0}^{2} \\mathrm{SST}'_{t-k}";

const BJERKNES_TEX_1 = "\\frac{dT}{dt} = R\\,T + F_1\\,h";
const BJERKNES_TEX_2 = "\\frac{dh}{dt} = -\\epsilon\\, h - F_2\\, T";

// Trailing window (months) for the ONI rate-of-change toggle's linear-regression
// slope -- short enough to track current conditions, long enough not to be just a
// noisy month-to-month diff.
const RATE_WINDOW_MONTHS = 3;
const RATE_OF_CHANGE_TEX =
  "v_m = \\dfrac{\\sum_i (x_i - \\bar x)(y_i - \\bar y)}{\\sum_i (x_i - \\bar x)^2}, \\quad x_i = \\text{month index}, \\; y_i = \\text{ONI}";

const FREQ_PERIODOGRAM_TEX =
  "P(f_k) = \\dfrac{2}{N}\\left| \\sum_{t=0}^{N-1} x_t\\, e^{-i 2\\pi k t/N} \\right|^2";
const FREQ_REDNOISE_TEX = "P^{\\text{red}}_k = \\dfrac{1-\\rho^2}{1 - 2\\rho\\cos(2\\pi k/N) + \\rho^2}";
const FREQ_THRESHOLD_TEX = "P_{c}(f_k) = P^{\\text{red}}_k \\times \\dfrac{\\chi^2_2(c)}{2}";

let contentBuilt = false;

function buildContentLayout(): void {
  content.innerHTML = `
    <div class="chart-card">
      <div class="chart-card-header">
        <h2>Regional Map</h2>
      </div>
      <p class="chart-caption">
        The three regions this dashboard's indices are sourced from -- the
        Ni&ntilde;o 3.4 sea-surface box, the WWV heat-content region, and the three
        850mb trade-wind sectors -- drawn on real coastlines. Click a row in the
        event catalog below to see a past episode's pattern instead of today's.
      </p>
      <p class="chart-caption" id="region-map-current"></p>
      <div class="chart-mount" id="region-map-mount"></div>
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <h2>ENSO Event Catalog</h2>
      </div>
      <div class="info-row">
        <button type="button" class="table-toggle" id="toggle-bjerknes" aria-expanded="false">info</button>
        <button type="button" class="table-toggle" id="toggle-events" aria-expanded="false">view events</button>
      </div>
      <div class="how-to-read info-panel" id="panel-bjerknes" hidden>
        <p class="math-note">Weaker winds warm the east, which weakens the winds further -- a reinforcing loop.</p>
        <div class="math-block">${renderMath(BJERKNES_TEX_1, true)}</div>
        <div class="math-block">${renderMath(BJERKNES_TEX_2, true)}</div>
        <ul class="math-legend">
          <li><span class="math-legend-symbol">${renderMath("T")}</span><span>SST anomaly</span></li>
          <li><span class="math-legend-symbol">${renderMath("h")}</span><span>thermocline depth</span></li>
          <li><span class="math-legend-symbol">${renderMath("R")}</span><span>feedback growth rate</span></li>
          <li><span class="math-legend-symbol">${renderMath("\\epsilon")}</span><span>damping</span></li>
          <li><span class="math-legend-symbol">${renderMath("F_1, F_2")}</span><span>coupling terms</span></li>
        </ul>

        <hr class="info-divider" />

        <p class="math-note">
          <strong>Onset rate</strong> (in the table below) is each event's average
          |&deg;C|/month from its start (ONI first crossing &plusmn;0.5&deg;C, month<sub>0</sub>)
          to its peak &mdash; absolute value, so El Ni&ntilde;o and La Ni&ntilde;a onset
          speeds are directly comparable:
        </p>
        <div class="math-block">${renderMath(
          "\\bar v = \\left| \\dfrac{\\text{ONI}_{\\text{peak}} - \\text{ONI}_0}{\\text{month}_{\\text{peak}} - \\text{month}_0} \\right|"
        )}</div>
        <p class="math-note">
          By the Mean Value Theorem, that average magnitude has to equal the event's
          actual, instantaneous rate of change at some point during the ramp-up, even
          though the month-to-month path there is noisy.
        </p>

        <hr class="info-divider" />

        <table class="category-legend">
          <thead>
            <tr><th>|ONI| at peak</th><th>El Ni&ntilde;o</th><th>La Ni&ntilde;a</th></tr>
          </thead>
          <tbody>
            <tr><td>0.5&ndash;0.99&deg;C</td><td class="cat-weak-el-nino">Weak</td><td class="cat-weak-la-nina">Weak</td></tr>
            <tr><td>1.0&ndash;1.49&deg;C</td><td class="cat-moderate-el-nino">Moderate</td><td class="cat-moderate-la-nina">Moderate</td></tr>
            <tr><td>1.5&ndash;1.99&deg;C</td><td class="cat-strong-el-nino">Strong</td><td class="cat-strong-la-nina">Strong</td></tr>
            <tr><td>&ge;2.0&deg;C</td><td class="cat-very-strong-el-nino">Very Strong (Super)</td><td class="cat-very-strong-la-nina">Very Strong</td></tr>
          </tbody>
        </table>
      </div>
      <div class="info-panel" id="panel-events" hidden>
        <p class="chart-caption">
          An episode counts once ONI passes &plusmn;0.5&deg;C and stays there for 5
          months in a row. "Confirmed" means SOI, heat content, and wind all backed
          it up. Click any row to zoom the charts to that period.
        </p>
        <div id="events-table-mount"></div>
      </div>
      <div class="filter-row" id="filter-row">
        <span class="filter-label">Jump to:</span>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <h2 id="oni-chart-title">Oceanic Ni&ntilde;o Index (ONI) &mdash; Sea Surface Temperature Anomaly</h2>
      </div>
      <div class="info-row">
        <button type="button" class="table-toggle" id="toggle-oni-info" aria-expanded="false">info</button>
        <button type="button" class="table-toggle" id="toggle-oni-rate" aria-pressed="false">rate of change</button>
      </div>
      <div class="how-to-read info-panel" id="panel-oni-info" hidden>
        <div class="math-block">${renderMath(ONI_RUNNING_MEAN_TEX, true)}</div>
        <p class="math-note">
          ONI <em>is</em> sea-surface-temperature anomaly -- how much warmer or cooler
          than normal the ocean surface is in the Ni&ntilde;o 3.4 region -- averaged
          over the last 3 months.
        </p>
        <p class="math-note">
          <strong>Rate of change</strong> plots the slope of that line instead of its
          level -- a trailing ${RATE_WINDOW_MONTHS}-month linear-regression slope, not a
          raw month-to-month difference (which is too noisy to read):
        </p>
        <div class="math-block">${renderMath(RATE_OF_CHANGE_TEX, true)}</div>
      </div>
      <div class="chart-mount" id="oni-chart-mount"></div>
      <div class="range-slider-block">
        <div class="range-slider-header">
          <span class="filter-label">Drag to zoom into any period:</span>
          <span id="range-slider-label" class="range-slider-label"></span>
        </div>
        <div id="range-slider"></div>
      </div>
      <details>
        <summary class="table-toggle" style="margin:10px 0;">View underlying monthly data as a table</summary>
        <div id="data-table-mount"></div>
      </details>
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <h2>Coupled Ocean&ndash;Atmosphere System</h2>
      </div>
      <p class="chart-caption">Wind &amp; heat-content records begin in 1979&ndash;1980.</p>
      <div class="legend-row">
        <button type="button" class="legend-item" data-series="soi" aria-pressed="true">
          <span class="swatch" style="background:var(--series-1)"></span>SOI
        </button>
        <button type="button" class="legend-item" data-series="wwv" aria-pressed="true">
          <span class="swatch" style="background:var(--series-2)"></span>Heat content (WWV, z)
        </button>
        <button type="button" class="legend-item" data-series="wind" aria-pressed="true">
          <span class="swatch" style="background:var(--series-3)"></span>Trade wind, East Pacific (z)
        </button>
        <button type="button" id="legend-show-all-static" class="link-button">Show all</button>
      </div>
      <div id="variable-detail"></div>
      <div class="chart-mount" id="coupled-chart-mount"></div>
    </div>

    <div class="chart-card">
      <div class="chart-card-header">
        <h2>Frequency Analysis</h2>
      </div>
      <div class="info-row">
        <button type="button" class="table-toggle" id="toggle-freq-info" aria-expanded="false">info</button>
      </div>
      <div class="how-to-read info-panel" id="panel-freq-info" hidden>
        <p class="math-note">
          A Fourier transform of the whole ONI record (1950&ndash;present), broken into
          its frequency components:
        </p>
        <div class="math-block">${renderMath(FREQ_PERIODOGRAM_TEX, true)}</div>
        <p class="math-note">
          A raw periodogram is noisy enough that picking out "peaks" by eye would
          often just be picking out noise. So a peak only counts as a <strong>dominant
          mode</strong> (marked and labeled on the chart) if it clears a confidence
          bound against a "red noise" null model &mdash; the standard baseline for
          climate time series, which tend to have more power at low frequencies than
          plain white noise, purely from month-to-month persistence and with no real
          periodicity at all (that's why the threshold itself rises at longer periods
          below). &rho; is this series' own lag-1 (month-to-month) autocorrelation;
          the slider below controls the confidence level <var>c</var>:
        </p>
        <div class="math-block">${renderMath(FREQ_REDNOISE_TEX, true)}</div>
        <div class="math-block">${renderMath(FREQ_THRESHOLD_TEX, true)}</div>
        <p class="math-note">
          This chart doesn't compare the result to any external cycle (solar, PDO,
          etc.) &mdash; it's the transform and whatever it finds, nothing layered on
          top.
        </p>

        <hr class="info-divider" />

        <p class="math-note">
          <strong>Windowing.</strong> A DFT treats the finite chunk of data it's given
          as if it repeats forever, wrapping the last point back around to the first.
          Real data almost never lines up cleanly at that seam (Jun 2026 doesn't
          smoothly continue into Jan 1950) &mdash; think of looping an audio clip that
          doesn't loop cleanly: you hear a click at the seam, and a click sounds like
          noise because it's made of a little bit of every frequency at once. That's
          spectral leakage, and it's a big part of why the chart looks noisiest at
          short periods. A <strong>window</strong> fades the ends of the series toward
          zero before transforming (like fading out a track instead of cutting it), so
          there's no click &mdash; at the cost of down-weighting real data near the
          edges, which blurs nearby periods together in exchange for a cleaner
          spectrum. <strong>Rectangular</strong> (the default) applies no fade at all;
          <strong>Hann</strong>, <strong>Welch</strong>, and <strong>Tukey</strong>
          below are three different fade shapes -- Hann fades the whole length,
          Welch is a gentler parabolic fade, Tukey stays flat in the middle 50% and
          only fades the outer edges. More:
          <a href="https://en.wikipedia.org/wiki/Window_function" target="_blank" rel="noopener">Window function (Wikipedia)</a>.
        </p>
        <div class="filter-row" id="freq-window-row">
          <span class="filter-label">Window:</span>
          <button type="button" class="filter-chip" data-window="rectangular" aria-pressed="true">Rectangular (default)</button>
          <button type="button" class="filter-chip" data-window="hann" aria-pressed="false">Hann</button>
          <button type="button" class="filter-chip" data-window="welch" aria-pressed="false">Welch</button>
          <button type="button" class="filter-chip" data-window="tukey" aria-pressed="false">Tukey</button>
        </div>
      </div>
      <p class="chart-caption">
        Dominant modes are labeled by period; the dashed line is the significance
        threshold above.
      </p>
      <div class="filter-row">
        <label class="filter-label" for="freq-confidence-slider">Confidence:</label>
        <input type="range" id="freq-confidence-slider" min="60" max="99.9" step="0.1" value="95" />
        <span id="freq-confidence-value"></span>
      </div>
      <div class="chart-mount" id="freq-chart-mount"></div>
    </div>

    <div class="stat-grid" id="stat-grid"></div>
  `;
  initRangeSlider();
  initLegend();
  initFilterChips();
  initEventsTableClick();
  initInfoToggles();
  initOniRateToggle();
  initFreqConfidenceSlider();
  initFreqWindowButtons();
  contentBuilt = true;
}

function computeDisplayState(): { records: MonthlyRecord[]; events: EnsoEvent[]; displayRecords: MonthlyRecord[] } {
  const records = filteredRecords();
  const events = filteredEvents(records);
  const displayRecords = smoothRecords(records, smoothingWindow);
  return { records, events, displayRecords };
}

/** Trailing-slope series aligned to `displayRecords`, or null values where the window
 * isn't fully populated -- shared by the ONI chart's rate mode and the stat tile. */
function computeOniRateSeries(displayRecords: MonthlyRecord[]): (number | null)[] {
  return trailingSlope(
    displayRecords.map((r) => r.oniAnom),
    RATE_WINDOW_MONTHS
  );
}

function latestOniRate(
  displayRecords: MonthlyRecord[],
  series: (number | null)[]
): { value: number; date: string } | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null) return { value: v, date: displayRecords[i].date };
  }
  return null;
}

function renderOniChart(displayRecords: MonthlyRecord[], events: EnsoEvent[]): void {
  const oniMount = document.querySelector<HTMLDivElement>("#oni-chart-mount")!;
  oniMount.innerHTML = "";
  if (oniRateMode) {
    const series = computeOniRateSeries(displayRecords);
    const rateRecords = displayRecords.map((r, i) => ({ ...r, oniAnom: series[i] }));
    oniMount.appendChild(buildOniChart(rateRecords, events, oniMount.clientWidth || undefined, "rate"));
  } else {
    oniMount.appendChild(buildOniChart(displayRecords, events, oniMount.clientWidth || undefined, "level"));
  }
}

function renderStatGrid(displayRecords: MonthlyRecord[]): void {
  const oniRate = oniRateMode ? latestOniRate(displayRecords, computeOniRateSeries(displayRecords)) : undefined;
  renderStatTiles(document.querySelector<HTMLDivElement>("#stat-grid")!, displayRecords, oniRate);
}

function renderCoupledChart(displayRecords: MonthlyRecord[], events: EnsoEvent[]): void {
  const coupledMount = document.querySelector<HTMLDivElement>("#coupled-chart-mount")!;
  coupledMount.innerHTML = "";
  coupledMount.appendChild(
    buildCoupledChart(displayRecords, events, visibleSeries, coupledMount.clientWidth || undefined)
  );
  updateLegendButtons();
  renderVariableDetail();
}

/** The regional map shows a single month's snapshot -- the latest one in the current
 * (possibly zoomed) window, so clicking an event row to zoom shows that episode's
 * wind/SST pattern near its end, same as the stat tiles' "latest in range" behavior.
 * `buildRegionMap` is async (it dynamically imports world-atlas's land geometry, ~100KB,
 * on first use rather than bundling it into every page load) -- `regionMapRenderToken`
 * discards a stale in-flight build if a newer one starts before it resolves (e.g. a
 * fast zoom followed by a resize), so results can never land out of order. */
let regionMapRenderToken = 0;
function renderRegionMap(displayRecords: MonthlyRecord[]): void {
  const mount = document.querySelector<HTMLDivElement>("#region-map-mount")!;
  const currentLabel = document.querySelector<HTMLParagraphElement>("#region-map-current")!;
  const record = displayRecords.length ? displayRecords[displayRecords.length - 1] : null;
  const token = ++regionMapRenderToken;
  const width = mount.clientWidth || undefined;
  buildRegionMap(record, width).then((svg) => {
    if (token !== regionMapRenderToken) return; // superseded by a later render
    mount.innerHTML = "";
    mount.appendChild(svg);
    currentLabel.innerHTML = record
      ? `Currently showing ${formatMonthLabel(record.date)}: box color follows that month's Ni&ntilde;o 3.4 / WWV
         anomaly. Arrows follow each wind sector's standardized anomaly &mdash; west means
         stronger-than-normal easterly trades, east means weaker or reversed. These are zonal
         scalar indices, so arrows show anomaly direction only, not a measured wind vector.`
      : "";
  });
}

/** The frequency chart, unlike every other chart on the page, doesn't depend on the
 * zoom/smoothing state at all -- `oniPeriodogram` (the DFT itself) is computed once
 * from the whole record in main(). The confidence level (the slider) is cheap to
 * reapply -- just a scale + peak scan -- so it's recomputed on every render rather
 * than cached, unlike the transform itself. */
function renderFrequencyChart(): void {
  const mount = document.querySelector<HTMLDivElement>("#freq-chart-mount")!;
  const significance = applyConfidence(oniPeriodogram, freqConfidence);
  const modes = findDominantModes(significance);
  mount.innerHTML = "";
  mount.appendChild(buildFrequencyChart(significance, modes, mount.clientWidth || undefined));
}

function confidenceLabel(confidence: number): string {
  return `${(confidence * 100).toFixed(1)}% confidence`;
}

function initFreqConfidenceSlider(): void {
  const slider = document.querySelector<HTMLInputElement>("#freq-confidence-slider")!;
  const value = document.querySelector<HTMLSpanElement>("#freq-confidence-value")!;
  value.textContent = confidenceLabel(freqConfidence);
  slider.addEventListener("input", (e) => {
    freqConfidence = Number((e.target as HTMLInputElement).value) / 100;
    value.textContent = confidenceLabel(freqConfidence);
    renderFrequencyChart();
  });
}

/** Unlike the confidence level, switching windows needs a real re-transform (the DFT
 * itself runs on the tapered series) -- still cheap enough (well under a frame at
 * ~900 points) to just call straight from the button click. */
function recomputePeriodogram(): void {
  oniPeriodogram = computePeriodogram(oniSeries, freqWindow);
}

function initFreqWindowButtons(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>("#freq-window-row button[data-window]");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const window = button.dataset.window as WindowType;
      if (window === freqWindow) return;
      freqWindow = window;
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      recomputePeriodogram();
      renderFrequencyChart();
    });
  });
}

/** Full rebuild -- use when the active window itself changed (zoom, pan, jump-to,
 * clicking an event row): records/events/stats/both charts/both tables all move. */
function renderContent(): void {
  if (!contentBuilt) buildContentLayout();
  const { records, events, displayRecords } = computeDisplayState();
  renderStatGrid(displayRecords);
  renderOniChart(displayRecords, events);
  renderCoupledChart(displayRecords, events);
  renderRegionMap(displayRecords);
  renderFrequencyChart();
  renderEventsTable(document.querySelector<HTMLDivElement>("#events-table-mount")!, events, eventSort);
  renderDataTable(document.querySelector<HTMLDivElement>("#data-table-mount")!, records);
}

/** Charts + stats only -- the window didn't change, just the smoothing, theme, or
 * viewport width, so the (potentially large) tables don't need touching at all. */
function renderChartsAndStats(): void {
  if (!contentBuilt) return;
  const { events, displayRecords } = computeDisplayState();
  renderStatGrid(displayRecords);
  renderOniChart(displayRecords, events);
  renderCoupledChart(displayRecords, events);
  renderRegionMap(displayRecords);
  renderFrequencyChart();
}

/** Just the coupled chart -- legend clicks only change which series are shown;
 * nothing else on the page depends on that (this is what used to also rebuild the
 * ONI chart and the whole events table on every click -- the page-jump culprit). */
function renderCoupledChartOnly(): void {
  if (!contentBuilt) return;
  const { events, displayRecords } = computeDisplayState();
  renderCoupledChart(displayRecords, events);
}

/** Just the events table -- for sort-header clicks, which don't touch anything else. */
function renderEventsTableOnly(): void {
  if (!contentBuilt) return;
  const { events } = computeDisplayState();
  renderEventsTable(document.querySelector<HTMLDivElement>("#events-table-mount")!, events, eventSort);
}

/** Just the ONI chart + stat grid -- the rate-of-change toggle only affects those two. */
function renderOniAndStats(): void {
  if (!contentBuilt) return;
  const { events, displayRecords } = computeDisplayState();
  renderStatGrid(displayRecords);
  renderOniChart(displayRecords, events);
}

function updateOniTitle(): void {
  const h2 = document.querySelector<HTMLHeadingElement>("#oni-chart-title");
  if (!h2) return;
  h2.innerHTML = oniRateMode
    ? "Oceanic Ni&ntilde;o Index (ONI) &mdash; Rate of Change"
    : "Oceanic Ni&ntilde;o Index (ONI) &mdash; Sea Surface Temperature Anomaly";
}

function initOniRateToggle(): void {
  const button = document.querySelector<HTMLButtonElement>("#toggle-oni-rate");
  button?.addEventListener("click", () => {
    oniRateMode = !oniRateMode;
    button.setAttribute("aria-pressed", String(oniRateMode));
    updateOniTitle();
    renderOniAndStats();
  });
}

function renderThemeToggle(): void {
  const theme = currentTheme();
  const button = document.querySelector<HTMLButtonElement>("#theme-toggle")!;
  button.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
  button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

async function main(): Promise<void> {
  applyTheme(currentTheme());
  renderThemeToggle();
  document.querySelector<HTMLButtonElement>("#theme-toggle")!.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    renderThemeToggle();
    if (allRecords.length) renderChartsAndStats();
  });

  const smoothingValue = document.querySelector<HTMLSpanElement>("#smoothing-value")!;
  smoothingValue.textContent = smoothingLabel(smoothingWindow);
  document.querySelector<HTMLInputElement>("#smoothing-slider")!.addEventListener("input", (e) => {
    smoothingWindow = Number((e.target as HTMLInputElement).value);
    smoothingValue.textContent = smoothingLabel(smoothingWindow);
    if (allRecords.length) renderChartsAndStats();
  });

  const data = await loadData();
  allRecords = data.records;
  allEvents = data.events;
  rangeStartIdx = 0;
  rangeEndIdx = allRecords.length - 1;

  // Whole-record ONI series only (see renderFrequencyChart) -- drop any trailing
  // unpublished month(s); the historical record itself has no interior gaps.
  oniSeries = allRecords.map((r) => r.oniAnom).filter((v): v is number => v !== null);
  recomputePeriodogram();

  renderContent();

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (localStorage.getItem(THEME_STORAGE_KEY)) return;
    applyTheme(currentTheme());
    renderThemeToggle();
    if (allRecords.length) renderChartsAndStats();
  });

  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (allRecords.length) renderChartsAndStats();
    }, 150);
  });
}

main();
