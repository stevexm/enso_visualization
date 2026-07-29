# ENSO Dashboard

An interactive dashboard for monitoring El Niño / La Niña using NOAA's four
operational ENSO variables (sea surface temperature, atmospheric pressure,
subsurface heat content, and Pacific trade winds) and the coupled
ocean-atmosphere feedback (the Bjerknes feedback) that links them.

For what each variable means, where the data comes from, how baselines are
computed, and how "El Niño" / "Super El Niño" are defined, see
[`docs/definitions.md`](docs/definitions.md).

## Running the dashboard

```bash
npm install
npm run dev
```

Then open the printed local URL. The dashboard reads static JSON from
`public/data/` (already generated and committed, and auto-refreshed from NOAA on
`npm run dev`/`npm run build` -- see "Refreshing the data" below).

## Refreshing the data

The *browser* does not fetch NOAA live -- NOAA's CPC/PMEL endpoints don't send an
`Access-Control-Allow-Origin` header, so an in-browser `fetch` from the dashboard's own
origin would be blocked by CORS (see the architecture notes in `docs/definitions.md`).
Instead, a Node-side script does it:

- `npm run dev` and `npm run build` automatically re-download the six raw NOAA files
  into `data-prep/raw/` and regenerate `public/data/enso-monthly.json` /
  `enso-events.json` before starting/building (via `predev`/`prebuild` ->
  `data:refresh`). No manual `curl` step needed. If a NOAA endpoint is unreachable
  (e.g. offline), that one file is skipped and the previously committed copy is kept --
  it won't block startup.
- Since these indices only update monthly, the refresh is throttled: it skips the
  actual NOAA re-download (and just rebuilds from the existing `data-prep/raw/` files)
  if the last check was under a week ago, tracked in the local, gitignored
  `data-prep/raw/.last-refresh`. Run `npm run data:refresh:force` to bypass the
  throttle and re-download immediately. (All six sources share one stamp since
  they're all monthly; a future sub-monthly source should get its own stamp rather
  than lowering this threshold for everyone.)
- To refresh without starting the dev server or build, run `npm run data:refresh`
  directly. `npm run data:build` alone just regenerates the JSON from whatever is
  already in `data-prep/raw/`, without re-downloading.

Either way it prints a summary (record count, event count, latest ONI reading), and in
dev mode a browser refresh is enough to see the new data -- no rebuild needed.

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
- `docs/definitions.md` -- variable definitions, sources, baselines,
  the El Niño / Super El Niño rule, and the architecture rationale.

## Build

```bash
npm run build   # type-checks src/ then builds a static bundle to dist/
npm run preview # serve that bundle locally
```
