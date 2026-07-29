import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "raw");
const STAMP_PATH = path.join(RAW_DIR, ".last-refresh");

// NOAA updates ONI/SOI/WWV/wind indices at most once a month, so re-checking
// more than once a week just spends requests for no new data. All six sources
// share one stamp since they're all monthly; if a sub-monthly source is ever
// added, give it its own stamp file rather than lowering this for everyone.
const MIN_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function daysSince(ms: number): string {
  return (ms / (24 * 60 * 60 * 1000)).toFixed(1);
}

function lastRefreshMs(): number | null {
  try {
    return Number(fs.readFileSync(STAMP_PATH, "utf8").trim());
  } catch {
    return null;
  }
}

const force = process.argv.includes("--force");
const last = lastRefreshMs();
if (!force && last && Date.now() - last < MIN_REFRESH_INTERVAL_MS) {
  console.log(
    `Skipping NOAA refresh -- last checked ${daysSince(Date.now() - last)}d ago (re-checks at most once/week). Use --force to override.`
  );
  process.exit(0);
}

const SOURCES: { file: string; url: string }[] = [
  { file: "oni.txt", url: "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt" },
  { file: "soi.txt", url: "https://www.cpc.ncep.noaa.gov/data/indices/soi" },
  { file: "wwv.dat", url: "https://www.pmel.noaa.gov/tao/wwv/data/wwv.dat" },
  { file: "epac850.txt", url: "https://www.cpc.ncep.noaa.gov/data/indices/epac850" },
  { file: "cpac850.txt", url: "https://www.cpc.ncep.noaa.gov/data/indices/cpac850" },
  { file: "wpac850.txt", url: "https://www.cpc.ncep.noaa.gov/data/indices/wpac850" },
];

async function refreshOne({ file, url }: { file: string; url: string }): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    fs.writeFileSync(path.join(RAW_DIR, file), text);
    console.log(`  ok  ${file}`);
  } catch (err) {
    console.warn(`  skip ${file} (${(err as Error).message}) -- keeping committed copy`);
  }
}

console.log("Refreshing NOAA source files (data-prep/raw/)...");
await Promise.all(SOURCES.map(refreshOne));
fs.writeFileSync(STAMP_PATH, String(Date.now()));
