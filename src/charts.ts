import * as Plot from "@observablehq/plot";
import type { EnsoEvent, MonthlyRecord } from "./types.ts";
import { classifyOniReading, cssVar, formatMonthLabel, formatSigned } from "./format.ts";
import type * as GeoJSON from "geojson";
import type * as TopoJSON from "topojson-specification";
import type { DominantMode, SignificancePoint } from "./frequency.ts";

export function toDate(dateStr: string): Date {
  return new Date(`${dateStr}-01T00:00:00Z`);
}

const DEFAULT_CHART_WIDTH = 880;

/** The ONI classification thresholds this chart draws -- exported so the in-app
 * "how to read this chart" prose can quote the exact same numbers instead of a
 * second, hand-typed copy that could drift out of sync. */
export const ONI_THRESHOLDS = [
  { value: 0.5, label: "El Niño" },
  { value: 2.0, label: "Super El Niño" },
  { value: -0.5, label: "La Niña" },
  { value: -2.0, label: "Super La Niña" },
] as const;

function plotStyle() {
  return {
    background: "transparent",
    color: cssVar("--text-secondary"),
    fontFamily: "inherit",
    fontSize: "11px",
  };
}

export type OniChartMode = "level" | "rate";

/** The headline chart: ONI over time, diverging warm/cool fill, tier thresholds, super-event labels.
 * In "rate" mode `records` is expected to carry a trailing-slope value (°C/month) in place of the
 * raw `oniAnom` level (see trailingSlope in stats.ts + the caller in main.ts) -- the level-specific
 * marks (tier thresholds, super-event dots) stop being meaningful once the y-axis is a slope, so
 * they're dropped in favor of just the zero line. */
export function buildOniChart(
  records: MonthlyRecord[],
  events: EnsoEvent[],
  width: number = DEFAULT_CHART_WIDTH,
  mode: OniChartMode = "level"
): SVGElement {
  const warm = cssVar("--diverging-warm");
  const cool = cssVar("--diverging-cool");
  const ink = cssVar("--text-primary");
  const muted = cssVar("--muted");
  const gridline = cssVar("--gridline");
  const baseline = cssVar("--baseline");

  const data = records
    .filter((r) => r.oniAnom !== null)
    .map((r) => ({ ...r, x: toDate(r.date), oni: r.oniAnom as number }));

  const superEvents = events.filter(
    (e) => e.category === "very-strong-el-nino" || e.category === "very-strong-la-nina"
  );
  const lastX = data.length ? data[data.length - 1].x : new Date();
  const thresholds = ONI_THRESHOLDS;

  const rateExtent = data.length ? Math.max(...data.map((d) => Math.abs(d.oni))) * 1.15 : 1;

  const plot = Plot.plot({
    width,
    height: 320,
    marginLeft: 46,
    marginRight: 96,
    marginBottom: 28,
    style: plotStyle(),
    x: { type: "utc", label: null },
    y:
      mode === "level"
        ? { label: "ONI (°C, SST anomaly)", grid: false, domain: [-3, 3] }
        : { label: "Rate of change (°C/month)", grid: false, domain: [-rateExtent, rateExtent] },
    marks: [
      Plot.gridY({ stroke: gridline }),
      Plot.areaY(data, { x: "x", y: (d) => Math.max(0, d.oni), fill: warm, fillOpacity: 0.45 }),
      Plot.areaY(data, { x: "x", y: (d) => Math.min(0, d.oni), fill: cool, fillOpacity: 0.45 }),
      Plot.lineY(data, { x: "x", y: "oni", stroke: ink, strokeWidth: 1.3 }),
      Plot.ruleY([0], { stroke: baseline }),
      ...(mode === "level"
        ? [
            Plot.ruleY(
              thresholds.map((t) => t.value),
              { stroke: muted, strokeWidth: 1 }
            ),
            Plot.text(
              thresholds.map((t) => ({ x: lastX, y: t.value, label: `${t.label} (${t.value > 0 ? "+" : ""}${t.value})` })),
              { x: "x", y: "y", text: "label", dx: 8, textAnchor: "start", fill: muted, fontSize: 10 }
            ),
            Plot.dot(
              superEvents.map((e) => ({ x: toDate(e.peakDate), y: e.peakOni })),
              { x: "x", y: "y", r: 4, fill: (d: { y: number }) => (d.y > 0 ? warm : cool), stroke: cssVar("--surface-1"), strokeWidth: 2 }
            ),
            Plot.text(
              superEvents
                .filter((e) => e.peakOni > 0)
                .map((e) => ({ x: toDate(e.peakDate), y: e.peakOni, label: `${e.startDate.slice(0, 4)}–${e.endDate.slice(2, 4)}` })),
              { x: "x", y: "y", text: "label", dy: -10, fill: ink, fontSize: 10, fontWeight: 600 }
            ),
            Plot.text(
              superEvents
                .filter((e) => e.peakOni <= 0)
                .map((e) => ({ x: toDate(e.peakDate), y: e.peakOni, label: `${e.startDate.slice(0, 4)}–${e.endDate.slice(2, 4)}` })),
              { x: "x", y: "y", text: "label", dy: 12, fill: ink, fontSize: 10, fontWeight: 600 }
            ),
          ]
        : []),
      Plot.ruleX(data, Plot.pointerX({ x: "x", stroke: muted })),
      Plot.tip(
        data,
        Plot.pointerX({
          x: "x",
          y: "oni",
          title: (d: (typeof data)[number]) =>
            mode === "level"
              ? `${formatMonthLabel(d.date)}\nONI: ${formatSigned(d.oni)}°C  (${classifyOniReading(d.oni).label})`
              : `${formatMonthLabel(d.date)}\nRate of change: ${formatSigned(d.oni, 3)}°C/mo`,
          fill: cssVar("--surface-1"),
          stroke: cssVar("--border"),
          textPadding: 8,
        }),
      ),
    ],
  });

  return plot as unknown as SVGElement;
}

export interface CoupledSeriesVisibility {
  soi: boolean;
  wwv: boolean;
  wind: boolean;
}

export const ALL_SERIES_VISIBLE: CoupledSeriesVisibility = { soi: true, wwv: true, wind: true };

/** The "coupled system" chart: SOI, subsurface heat content (WWV z), and trade-wind (z) together,
 * with El Nino / La Nina windows washed in behind them -- the other three legs of the Bjerknes
 * feedback loop besides SST (see docs/definitions.md). `visible` lets the caller hide/isolate
 * series (e.g. a clickable legend) -- the y-axis rescales to whatever's still shown, so
 * isolating one variable also zooms in on it. */
export function buildCoupledChart(
  records: MonthlyRecord[],
  events: EnsoEvent[],
  visible: CoupledSeriesVisibility = ALL_SERIES_VISIBLE,
  width: number = DEFAULT_CHART_WIDTH
): SVGElement {
  const warm = cssVar("--diverging-warm");
  const cool = cssVar("--diverging-cool");
  const s1 = cssVar("--series-1");
  const s2 = cssVar("--series-2");
  const s3 = cssVar("--series-3");
  const muted = cssVar("--muted");
  const gridline = cssVar("--gridline");
  const baseline = cssVar("--baseline");

  const soiData = visible.soi
    ? records.filter((r) => r.soiStd !== null).map((r) => ({ x: toDate(r.date), v: r.soiStd as number }))
    : [];
  const wwvData = visible.wwv
    ? records.filter((r) => r.wwvZ !== null).map((r) => ({ x: toDate(r.date), v: r.wwvZ as number }))
    : [];
  const windData = visible.wind
    ? records.filter((r) => r.windEastZ !== null).map((r) => ({ x: toDate(r.date), v: r.windEastZ as number }))
    : [];
  const tipData = records
    .filter((r) => r.soiStd !== null || r.wwvZ !== null || r.windEastZ !== null)
    .map((r) => ({ ...r, x: toDate(r.date) }));

  const allValues = [...soiData, ...wwvData, ...windData].map((d) => d.v);
  const extent = allValues.length ? Math.max(...allValues.map(Math.abs)) * 1.15 : 3;

  const eventBands = events
    .filter((e) => e.startDate <= records[records.length - 1]?.date && e.endDate >= records[0]?.date)
    .map((e) => ({
      x1: toDate(e.startDate),
      x2: toDate(e.endDate),
      fill: e.phase === "el-nino" ? warm : cool,
    }));

  const plot = Plot.plot({
    width,
    height: 260,
    marginLeft: 46,
    marginRight: 20,
    marginBottom: 28,
    style: plotStyle(),
    x: { type: "utc", label: null },
    y: { label: "Standardized anomaly (z-score)", domain: [-extent, extent] },
    marks: [
      Plot.rect(eventBands, { x1: "x1", x2: "x2", y1: -extent, y2: extent, fill: "fill", fillOpacity: 0.07 }),
      Plot.gridY({ stroke: gridline }),
      Plot.ruleY([0], { stroke: baseline }),
      ...(visible.soi ? [Plot.lineY(soiData, { x: "x", y: "v", stroke: s1, strokeWidth: 1.3 })] : []),
      ...(visible.wwv ? [Plot.lineY(wwvData, { x: "x", y: "v", stroke: s2, strokeWidth: 1.3 })] : []),
      ...(visible.wind ? [Plot.lineY(windData, { x: "x", y: "v", stroke: s3, strokeWidth: 1.3 })] : []),
      Plot.ruleX(tipData, Plot.pointerX({ x: "x", stroke: muted })),
      Plot.tip(
        tipData,
        Plot.pointerX({
          x: "x",
          y: (d: (typeof tipData)[number]) => d.soiStd ?? d.wwvZ ?? d.windEastZ ?? 0,
          title: (d: (typeof tipData)[number]) =>
            [
              formatMonthLabel(d.date),
              ...(visible.soi ? [`SOI: ${formatSigned(d.soiStd)}`] : []),
              ...(visible.wwv ? [`Heat content (WWV, z): ${formatSigned(d.wwvZ)}`] : []),
              ...(visible.wind ? [`Trade wind, East Pac (z): ${formatSigned(d.windEastZ)}`] : []),
            ].join("\n"),
          fill: cssVar("--surface-1"),
          stroke: cssVar("--border"),
          textPadding: 8,
        }),
      ),
    ],
  });

  return plot as unknown as SVGElement;
}

// Boxes, straight from each raw source's own header (see data-prep/raw/*.txt and
// docs/definitions.md §1) -- standard -180..180 lon/lat, same convention as the land
// GeoJSON below. The projection's rotation (see PACIFIC_ROTATE) is what keeps this
// basin contiguous on screen despite WWV's box crossing the antimeridian here.
const NINO34_BOX = { x1: -170, x2: -120 }; // Nino 3.4: 170W-120W
const WWV_BOX = { x1: 120, x2: -80 }; // WWV: 120E-80W

interface WindSectorSpec {
  key: "windWestZ" | "windCentralZ" | "windEastZ";
  label: string;
  x1: number;
  x2: number;
}

const WIND_SECTORS: WindSectorSpec[] = [
  { key: "windWestZ", label: "West Pacific", x1: 135, x2: 180 }, // 135E-180W
  { key: "windCentralZ", label: "Central Pacific", x1: -175, x2: -140 }, // 175W-140W
  { key: "windEastZ", label: "East Pacific", x1: -135, x2: -120 }, // 135W-120W
];

export interface RegionMapRecord {
  date: string;
  oniAnom: number | null;
  wwvZ: number | null;
  windEastZ: number | null;
  windCentralZ: number | null;
  windWestZ: number | null;
}

/** Fill opacity that grows with |value| but never hits 0 (so the box outline always
 * reads as "this is the sourced region" even in a near-neutral month) or fully opaque
 * (so labels drawn over it stay legible). Clipped at 3 sigma / 3 degC. */
function magnitudeOpacity(value: number | null, clip: number): number {
  if (value === null) return 0.05;
  return 0.12 + (0.5 * Math.min(Math.abs(value), clip)) / clip;
}

// Longitude the projection is rotated by before its plain (lon, lat) plate-carrée
// projection -- a pure-yaw rotation (no tilt), so it only shifts which meridian sits
// at the seam; it does not distort latitude or bend meridians/parallels. Chosen so the
// seam lands over the Atlantic (~20W), far from every sourced region here, all of
// which then fall on one contiguous, monotonic span of the frame -- including WWV's
// box, which crosses the conventional +/-180 antimeridian in raw coordinates.
const PACIFIC_ROTATE: [number, number] = [-160, 0];

// The window to fit the projection to -- as plain corner points (not a connected
// path), so there's no antimeridian-interpolation question: fitSize just needs their
// projected extremes, and both corners land on the same monotonic span under the
// rotation above.
const PACIFIC_DOMAIN: GeoJSON.MultiPoint = {
  type: "MultiPoint",
  coordinates: [
    [100, -25],
    [100, 25],
    [-60, -25],
    [-60, 25],
  ],
};

let landFeaturePromise: Promise<GeoJSON.Feature> | null = null;

/** Lazily imports world-atlas's land topology (a few dozen KB) only once this chart is
 * actually built, not on initial page load -- this is the only chart that needs it. */
async function loadLandFeature(): Promise<GeoJSON.Feature> {
  landFeaturePromise ??= (async () => {
    const [{ feature }, topology] = await Promise.all([
      import("topojson-client"),
      import("world-atlas/land-110m.json"),
    ]);
    const topo = topology.default as unknown as TopoJSON.Topology;
    return feature(topo, topo.objects.land as TopoJSON.GeometryCollection) as unknown as GeoJSON.Feature;
  })();
  return landFeaturePromise;
}

/** The regional map: real coastlines (world-atlas, via `Plot.geo` + an equirectangular
 * projection -- see docs/plan.md workstream 2) with the three sourced index regions
 * drawn as boxes on top, plus one arrow per wind sector showing that month's
 * standardized anomaly. Arrows point west for a positive z (stronger-than-normal
 * easterly trades) and east for negative (weaker/reversed trades, the El Nino
 * direction) -- an anomaly direction, not a literal wind vector, which the caller's
 * caption spells out. Async because the land geometry loads on demand (see
 * `loadLandFeature`); callers should await it before mounting the result. */
export async function buildRegionMap(
  record: RegionMapRecord | null,
  width: number = DEFAULT_CHART_WIDTH,
): Promise<SVGElement> {
  const land = await loadLandFeature();

  const warm = cssVar("--diverging-warm");
  const cool = cssVar("--diverging-cool");
  const wwvColor = cssVar("--series-2");
  const windColor = cssVar("--series-3");
  const ink = cssVar("--text-primary");
  const muted = cssVar("--muted");
  const gridline = cssVar("--gridline");
  const landFill = cssVar("--baseline");

  const oniAnom = record?.oniAnom ?? null;
  const wwvZ = record?.wwvZ ?? null;

  const ninoBox = [
    {
      ...NINO34_BOX,
      y1: -5,
      y2: 5,
      fill: oniAnom === null ? muted : oniAnom >= 0 ? warm : cool,
      fillOpacity: magnitudeOpacity(oniAnom, 3),
    },
  ];
  const wwvBox = [
    { ...WWV_BOX, y1: -5, y2: 5, fill: wwvZ === null ? muted : wwvColor, fillOpacity: magnitudeOpacity(wwvZ, 3) },
  ];
  const sectorBoxes = WIND_SECTORS.map((sector) => ({ ...sector, y1: -5, y2: 5 }));

  const ARROW_MAX_DEG = 9;
  const arrows = WIND_SECTORS.map((sector) => {
    const z = record ? record[sector.key] : null;
    if (z === null) return null;
    const cx = (sector.x1 + sector.x2) / 2;
    const len = (ARROW_MAX_DEG * Math.min(Math.abs(z), 3)) / 3;
    const dir = z >= 0 ? -1 : 1; // positive z: stronger easterly -> points west (-lon)
    return { x1: cx - (dir * len) / 2, y1: 0, x2: cx + (dir * len) / 2, y2: 0, z, sector };
  }).filter((d): d is NonNullable<typeof d> => d !== null);

  const sectorLabels = WIND_SECTORS.map((sector) => {
    const z = record ? record[sector.key] : null;
    return {
      x: (sector.x1 + sector.x2) / 2,
      y: 9,
      label: `${sector.label}\n${z === null ? "no data" : `${formatSigned(z, 2)} z`}`,
    };
  });

  const plot = Plot.plot({
    width,
    height: 260,
    marginLeft: 10,
    marginRight: 10,
    marginTop: 10,
    marginBottom: 10,
    style: plotStyle(),
    projection: { type: "equirectangular", rotate: PACIFIC_ROTATE, domain: PACIFIC_DOMAIN },
    marks: [
      Plot.graticule({ stroke: gridline, strokeOpacity: 0.6 }),
      Plot.geo(land, { fill: landFill, stroke: gridline, strokeWidth: 0.75 }),
      Plot.rect(sectorBoxes, {
        x1: "x1",
        x2: "x2",
        y1: "y1",
        y2: "y2",
        fill: "none",
        stroke: windColor,
        strokeOpacity: 0.5,
        strokeDasharray: "3,2",
      }),
      Plot.rect(wwvBox, {
        x1: "x1",
        x2: "x2",
        y1: "y1",
        y2: "y2",
        fill: "fill",
        fillOpacity: "fillOpacity",
        stroke: wwvZ === null ? muted : wwvColor,
        strokeOpacity: 0.6,
      }),
      Plot.rect(ninoBox, {
        x1: "x1",
        x2: "x2",
        y1: "y1",
        y2: "y2",
        fill: "fill",
        fillOpacity: "fillOpacity",
        stroke: oniAnom === null ? muted : oniAnom >= 0 ? warm : cool,
        strokeWidth: 1.3,
      }),
      Plot.text([{ x: WWV_BOX.x1 + 3, y: -8, label: "WWV integration region" }], {
        x: "x",
        y: "y",
        text: "label",
        fill: muted,
        fontSize: 10,
        textAnchor: "start",
      }),
      Plot.text(
        [
          {
            x: (NINO34_BOX.x1 + NINO34_BOX.x2) / 2,
            y: 0,
            label: `Niño 3.4\n${oniAnom === null ? "no data" : `${formatSigned(oniAnom)}°C`}`,
          },
        ],
        { x: "x", y: "y", text: "label", fill: ink, fontSize: 10, fontWeight: 600, lineAnchor: "middle" },
      ),
      Plot.text(sectorLabels, { x: "x", y: "y", text: "label", fill: muted, fontSize: 9.5, lineAnchor: "top" }),
      Plot.arrow(arrows, {
        x1: "x1",
        y1: "y1",
        x2: "x2",
        y2: "y2",
        stroke: windColor,
        strokeWidth: (d: (typeof arrows)[number]) => 1.5 + Math.min(Math.abs(d.z), 3),
        headLength: 6,
        insetEnd: 1,
      }),
      Plot.frame({ stroke: gridline }),
    ],
  });

  return plot as unknown as SVGElement;
}

/** The frequency chart: an ONI periodogram (period in years, log-log) with its
 * red-noise significance threshold (see `computePeriodogram` in frequency.ts) and the
 * dominant modes that clear it marked and labeled. No comparison to external cycles
 * (solar, PDO, etc.) by design -- this is the transform and what it finds, nothing
 * layered on top. */
export function buildFrequencyChart(
  periodogram: SignificancePoint[],
  modes: DominantMode[],
  width: number = DEFAULT_CHART_WIDTH,
): SVGElement {
  const ink = cssVar("--text-primary");
  const muted = cssVar("--muted");
  const gridline = cssVar("--gridline");
  const accent = cssVar("--series-1");

  // Stagger label height 3 ways by adjacency-in-period (not array order, which is
  // sorted by power) -- dominant modes are often clustered close together in period
  // (e.g. two ENSO-band peaks a few months apart), and their *power* can differ a lot
  // (log scale), so even/odd alternation isn't enough separation when a low-power
  // peak's raised label lands near a neighboring high-power peak's own label. Plot's
  // `dy` is a constant, not a per-datum channel, so this splits into three marks.
  const byPeriod = [...modes].sort((a, b) => a.periodYears - b.periodYears);
  const DY_TIERS = [-10, -30, -54, -80];
  const modeTiers = DY_TIERS.map((_, tier) => byPeriod.filter((_, i) => i % DY_TIERS.length === tier));
  const modeLabel = (d: DominantMode) => (d.periodYears < 1 ? `${Math.round(d.periodYears * 12)}mo` : `${d.periodYears.toFixed(1)}yr`);

  const plot = Plot.plot({
    width,
    height: 320,
    marginLeft: 52,
    marginRight: 20,
    marginBottom: 32,
    marginTop: 96,
    style: plotStyle(),
    x: { type: "log", label: "Period (years)", grid: true },
    y: { type: "log", label: "Power (log scale)", grid: false },
    marks: [
      Plot.gridX({ stroke: gridline }),
      Plot.lineY(periodogram, { x: "periodYears", y: "threshold", stroke: muted, strokeWidth: 1, strokeDasharray: "3,2" }),
      Plot.lineY(periodogram, { x: "periodYears", y: "power", stroke: ink, strokeWidth: 1.3 }),
      Plot.dot(modes, { x: "periodYears", y: "power", r: 4, fill: accent, stroke: cssVar("--surface-1"), strokeWidth: 1.5 }),
      ...modeTiers.map((tierModes, i) =>
        Plot.text(tierModes, { x: "periodYears", y: "power", text: modeLabel, dy: DY_TIERS[i], fill: ink, fontSize: 10, fontWeight: 600 }),
      ),
      Plot.ruleX(periodogram, Plot.pointerX({ x: "periodYears", stroke: muted })),
      Plot.tip(
        periodogram,
        Plot.pointerX({
          x: "periodYears",
          y: "power",
          title: (d: SignificancePoint) =>
            `Period: ${d.periodYears < 1 ? `${Math.round(d.periodYears * 12)} months` : `${d.periodYears.toFixed(2)} years`}\nPower: ${d.power.toFixed(3)}\n${d.power > d.threshold ? "above" : "below"} the 95% red-noise threshold`,
          fill: cssVar("--surface-1"),
          stroke: cssVar("--border"),
          textPadding: 8,
        }),
      ),
    ],
  });

  return plot as unknown as SVGElement;
}
