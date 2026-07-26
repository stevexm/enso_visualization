# ENSO Dashboard

An interactive dashboard for monitoring El Niño / La Niña using NOAA's four
operational ENSO variables (sea surface temperature, atmospheric pressure,
subsurface heat content, and Pacific trade winds) and the coupled
ocean-atmosphere feedback (the Bjerknes feedback) that links them.

For what each variable means, where the data comes from, how baselines are
computed, and how "El Niño" / "Super El Niño" are defined, see
[`docs/data-and-definitions.md`](docs/data-and-definitions.md).

## Running the dashboard

```bash
npm install
npm run dev
```

Then open the printed local URL. The dashboard reads static JSON from
`public/data/` (already generated and committed) -- no build step is required
for the data itself.

## Refreshing the data

The dashboard does not fetch NOAA live (see the architecture notes in
`docs/data-and-definitions.md` for why). To pull newer months:

1. Re-download the six raw files into `data-prep/raw/`:
   ```bash
   cd data-prep/raw
   curl -sS -o oni.txt      https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
   curl -sS -o soi.txt      https://www.cpc.ncep.noaa.gov/data/indices/soi
   curl -sS -o wwv.dat      https://www.pmel.noaa.gov/tao/wwv/data/wwv.dat
   curl -sS -o epac850.txt  https://www.cpc.ncep.noaa.gov/data/indices/epac850
   curl -sS -o cpac850.txt  https://www.cpc.ncep.noaa.gov/data/indices/cpac850
   curl -sS -o wpac850.txt  https://www.cpc.ncep.noaa.gov/data/indices/wpac850
   cd ../..
   ```
2. Regenerate the derived JSON:
   ```bash
   npm run data:build
   ```
   This overwrites `public/data/enso-monthly.json` and `public/data/enso-events.json`
   and prints a summary (record count, event count, latest ONI reading).
3. Refresh the browser -- no rebuild needed in dev mode.

`npm run data:typecheck` type-checks the data-prep pipeline on its own (it has
a separate `tsconfig.json` targeting Node, since it's not part of the browser
bundle).

## Project layout

- `data-prep/` -- Node/TypeScript pipeline: parses the raw NOAA text files,
  merges them into a monthly series, computes baselines and the El Niño /
  Super El Niño event catalog. Not shipped to the browser.
- `public/data/` -- the pipeline's output, loaded by the dashboard at runtime.
- `src/` -- the dashboard itself (Vite + TypeScript + Observable Plot):
  `charts.ts` (the two Plot figures), `ui.ts` (stat tiles / tables), `format.ts`
  (labels, thresholds, date-range presets), `main.ts` (page assembly & state).
- `docs/data-and-definitions.md` -- variable definitions, sources, baselines,
  the El Niño / Super El Niño rule, and the architecture rationale.

## Build

```bash
npm run build   # type-checks src/ then builds a static bundle to dist/
npm run preview # serve that bundle locally
```
