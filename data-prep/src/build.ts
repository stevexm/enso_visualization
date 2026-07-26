import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOni } from "./parseOni.ts";
import { parseNthYearTable } from "./fixedWidthTable.ts";
import { parseWwv } from "./parseWwv.ts";
import { toMonthlyClimatologyZScore } from "./baseline.ts";
import { findEnsoEvents } from "./classify.ts";
import type { MonthlyPoint, MonthlyRecord } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "raw");
const OUT_DIR = path.join(__dirname, "..", "..", "public", "data");

function toMap(points: MonthlyPoint[]): Map<string, number> {
  return new Map(points.map((p) => [p.date, p.value]));
}

const oni = parseOni(path.join(RAW_DIR, "oni.txt"));
// soi.txt stacks two tables (raw anomaly, then standardized); table 2 is the
// conventional "SOI" everyone means when they say Southern Oscillation Index.
const soiStd = parseNthYearTable(path.join(RAW_DIR, "soi.txt"), 2);
const wwv = parseWwv(path.join(RAW_DIR, "wwv.dat"));
const windEast = parseNthYearTable(path.join(RAW_DIR, "epac850.txt"), 1);
const windCentral = parseNthYearTable(path.join(RAW_DIR, "cpac850.txt"), 1);
const windWest = parseNthYearTable(path.join(RAW_DIR, "wpac850.txt"), 1);

const wwvZ = toMonthlyClimatologyZScore(wwv.anomaly);
const windEastZ = toMonthlyClimatologyZScore(windEast);
const windCentralZ = toMonthlyClimatologyZScore(windCentral);
const windWestZ = toMonthlyClimatologyZScore(windWest);

const oniMap = toMap(oni);
const soiMap = toMap(soiStd);
const wwvVolumeMap = toMap(wwv.volume);
const wwvAnomMap = toMap(wwv.anomaly);
const wwvZMap = toMap(wwvZ);
const windEastRawMap = toMap(windEast);
const windEastZMap = toMap(windEastZ);
const windCentralRawMap = toMap(windCentral);
const windCentralZMap = toMap(windCentralZ);
const windWestRawMap = toMap(windWest);
const windWestZMap = toMap(windWestZ);

const allDates = new Set<string>([
  ...oniMap.keys(),
  ...soiMap.keys(),
  ...wwvVolumeMap.keys(),
  ...windEastRawMap.keys(),
]);
const sortedDates = [...allDates].sort();

const records: MonthlyRecord[] = sortedDates.map((date) => {
  const [year, month] = date.split("-").map(Number);
  return {
    date,
    year,
    month,
    oniAnom: oniMap.get(date) ?? null,
    soiStd: soiMap.get(date) ?? null,
    wwvVolume: wwvVolumeMap.get(date) ?? null,
    wwvAnom: wwvAnomMap.get(date) ?? null,
    wwvZ: wwvZMap.get(date) ?? null,
    windEastRaw: windEastRawMap.get(date) ?? null,
    windEastZ: windEastZMap.get(date) ?? null,
    windCentralRaw: windCentralRawMap.get(date) ?? null,
    windCentralZ: windCentralZMap.get(date) ?? null,
    windWestRaw: windWestRawMap.get(date) ?? null,
    windWestZ: windWestZMap.get(date) ?? null,
  };
});

const events = findEnsoEvents(records);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "enso-monthly.json"), JSON.stringify(records));
fs.writeFileSync(path.join(OUT_DIR, "enso-events.json"), JSON.stringify(events, null, 2));

const latest = records[records.length - 1];
const latestWithOni = [...records].reverse().find((r) => r.oniAnom !== null);
console.log(`Wrote ${records.length} monthly records (${records[0].date} to ${latest.date}).`);
console.log(`Found ${events.length} ENSO events (>= 5 consecutive months at |ONI| >= 0.5).`);
console.log(`Latest ONI: ${latestWithOni?.oniAnom} (${latestWithOni?.date})`);
