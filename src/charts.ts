import * as Plot from "@observablehq/plot";
import type { EnsoEvent, MonthlyRecord } from "./types.ts";
import { classifyOniReading, cssVar, formatMonthLabel, formatSigned } from "./format.ts";

export function toDate(dateStr: string): Date {
  return new Date(`${dateStr}-01T00:00:00Z`);
}

const CHART_WIDTH = 880;

function plotStyle() {
  return {
    background: "transparent",
    color: cssVar("--text-secondary"),
    fontFamily: "inherit",
    fontSize: "11px",
  };
}

/** The headline chart: ONI over time, diverging warm/cool fill, tier thresholds, super-event labels. */
export function buildOniChart(records: MonthlyRecord[], events: EnsoEvent[]): SVGElement {
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

  const thresholds = [
    { value: 0.5, label: "El Niño" },
    { value: 2.0, label: "Super El Niño" },
    { value: -0.5, label: "La Niña" },
    { value: -2.0, label: "Super La Niña" },
  ];

  const plot = Plot.plot({
    width: CHART_WIDTH,
    height: 320,
    marginLeft: 46,
    marginRight: 96,
    marginBottom: 28,
    style: plotStyle(),
    x: { type: "utc", label: null },
    y: { label: "ONI (°C, SST anomaly)", grid: false },
    marks: [
      Plot.gridY({ stroke: gridline }),
      Plot.areaY(data, { x: "x", y: (d) => Math.max(0, d.oni), fill: warm, fillOpacity: 0.45 }),
      Plot.areaY(data, { x: "x", y: (d) => Math.min(0, d.oni), fill: cool, fillOpacity: 0.45 }),
      Plot.lineY(data, { x: "x", y: "oni", stroke: ink, strokeWidth: 1.3 }),
      Plot.ruleY([0], { stroke: baseline }),
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
      Plot.ruleX(data, Plot.pointerX({ x: "x", stroke: muted })),
      Plot.tip(
        data,
        Plot.pointerX({
          x: "x",
          y: "oni",
          title: (d: (typeof data)[number]) =>
            `${formatMonthLabel(d.date)}\nONI: ${formatSigned(d.oni)}°C  (${classifyOniReading(d.oni).label})`,
          fill: cssVar("--surface-1"),
          stroke: cssVar("--border"),
          textPadding: 8,
        }),
      ),
    ],
  });

  return plot as unknown as SVGElement;
}

/** The "coupled system" chart: SOI, subsurface heat content (WWV z), and trade-wind (z) together,
 * with El Nino / La Nina windows washed in behind them -- the other three legs of the Bjerknes
 * feedback loop besides SST (see docs/data-and-definitions.md). */
export function buildCoupledChart(records: MonthlyRecord[], events: EnsoEvent[]): SVGElement {
  const warm = cssVar("--diverging-warm");
  const cool = cssVar("--diverging-cool");
  const s1 = cssVar("--series-1");
  const s2 = cssVar("--series-2");
  const s3 = cssVar("--series-3");
  const muted = cssVar("--muted");
  const gridline = cssVar("--gridline");
  const baseline = cssVar("--baseline");

  const soiData = records.filter((r) => r.soiStd !== null).map((r) => ({ x: toDate(r.date), v: r.soiStd as number }));
  const wwvData = records.filter((r) => r.wwvZ !== null).map((r) => ({ x: toDate(r.date), v: r.wwvZ as number }));
  const windData = records
    .filter((r) => r.windEastZ !== null)
    .map((r) => ({ x: toDate(r.date), v: r.windEastZ as number }));
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
    width: CHART_WIDTH,
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
      Plot.lineY(soiData, { x: "x", y: "v", stroke: s1, strokeWidth: 1.3 }),
      Plot.lineY(wwvData, { x: "x", y: "v", stroke: s2, strokeWidth: 1.3 }),
      Plot.lineY(windData, { x: "x", y: "v", stroke: s3, strokeWidth: 1.3 }),
      Plot.ruleX(tipData, Plot.pointerX({ x: "x", stroke: muted })),
      Plot.tip(
        tipData,
        Plot.pointerX({
          x: "x",
          y: (d: (typeof tipData)[number]) => d.soiStd ?? d.wwvZ ?? d.windEastZ ?? 0,
          title: (d: (typeof tipData)[number]) =>
            [
              formatMonthLabel(d.date),
              `SOI: ${formatSigned(d.soiStd)}`,
              `Heat content (WWV, z): ${formatSigned(d.wwvZ)}`,
              `Trade wind, East Pac (z): ${formatSigned(d.windEastZ)}`,
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
