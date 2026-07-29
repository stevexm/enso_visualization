# Feature plan: math, interactivity, a map, and finer-grained data

## What this plan is

A build plan for dashboard features, turned from a raw idea-dump (KaTeX math,
interactive running-average, rate-of-change / stochasticity, Fourier comparison to
other cycles, clearer variable definitions, a regional map, finer-grained data) into
workstreams ordered **cheapest-to-build first**. Each states its goal, exact steps,
library (if any), effort tier, and any decision that needs your input — marked
**ASK USER**.

## Already shipped

These used to be workstreams in this doc; they're built now, so they're gone from the
list below (removed, not just checked off, per your ask) — this section is just the
paper trail of what happened to the original ideas:

- **Smoothing slider** (`src/stats.ts`, `src/main.ts`) -- a 1-12 month rolling average
  applied client-side on top of the published monthly values. Display-only, exactly as
  recommended: the ENSO event catalog still always uses NOAA's official published data
  and ignores this slider.
- **Custom time-window slider** (`src/rangeSlider.ts`) -- a dependency-free dual-handle
  slider below the ONI chart. Drag either handle to resize the window, or drag the bar
  between them to pan a fixed-width window across history. Coexists with the "Jump to"
  preset chips.
- **KaTeX + clearer definitions + interactive legend** -- `katex` is now a real
  dependency (`src/math.ts`). The ONI chart has a collapsible "How to read this chart"
  block with the running-mean formula and the exact threshold numbers `buildOniChart`
  draws (`ONI_THRESHOLDS`, exported from `src/charts.ts`, one source of truth). The
  event catalog has a collapsible Bjerknes-feedback explainer with the recharge-
  oscillator ODEs. The coupled chart's legend (`src/main.ts`, `src/variableDetails.ts`)
  is now clickable: click a variable to isolate it (the chart rescales to just that
  series and its formula/definition appears below), click again to restore it, or use
  "Show all" to reset. `docs/definitions.md` §3.2 also got the bridging paragraph and
  worked numeric example this plan called for.
- **Measurement-interval clarity** -- the dashboard footer now states plainly that all
  four series are monthly composites and that none of the current NOAA/PMEL sources
  publish a daily/weekly version of these specific indices. The workstream below is
  what happens if that's ever revisited for real.
- **Regional map** (`buildRegionMap` in `src/charts.ts`, mounted in `src/main.ts`) --
  an actual projected map (`@observablehq/plot`'s `projection`/`Plot.geo`, real
  coastlines from `world-atlas` + `topojson-client`, loaded on demand via dynamic
  import so the ~100KB land geometry isn't in the main bundle), rotated so the Pacific
  basin sits contiguous on screen despite WWV's box crossing the conventional
  antimeridian. The three sourced regions draw as boxes on top -- Niño 3.4 (170W-120W)
  tinted by that month's ONI, the WWV integration region (120E-80W) tinted by that
  month's heat-content z-score, the three 850mb wind sectors outlined -- plus one arrow
  per wind sector sized and directed by that sector's standardized anomaly. Captioned
  explicitly: real coastlines, but the arrows are not a real wind-vector field, since
  these indices are zonal (east-west) scalars by construction. Box/sector coordinates
  came straight from each raw NOAA file's own header line, not a second hand-typed
  copy. It's a single-month snapshot -- bound to the latest record in whatever date
  range is currently zoomed, so clicking an event row shows that episode's pattern near
  its end, same "zoom to compare" behavior the rate-of-change toggle already
  established. First pass is Niño 3.4 + WWV + wind only, on purpose -- see the note at
  the end of this section for what a follow-up layer (temperature, wind channels) could
  add on top of this same projected base.
- **Frequency analysis** (`src/frequency.ts`, `buildFrequencyChart` in `src/charts.ts`,
  mounted in `src/main.ts`) -- re-scoped from the original "periodogram with solar/PDO
  reference lines" idea after talking through it: this is a basic DFT periodogram of
  the whole-record (1950-present) ONI series, no FFT dependency needed, with a
  **red-noise (AR1) significance test** (Gilman et al. 1963 / Torrence & Compo 1998's
  chi-square(2) formulation) so a peak only counts as a labeled "dominant mode" if it
  clears 95% confidence against lag-1-autocorrelated noise -- not just any local
  maximum, which a raw periodogram has plenty of that are just noise. No comparison to
  external cycles (solar, PDO, etc.) -- explicitly out of scope for this pass, per
  direct instruction ("just get a fourier transform to find dominant modes"). Log-log
  chart (period in years vs. power), dashed significance threshold, dominant peaks
  dotted and labeled with 3-way height staggering (peaks cluster close together in
  period, and their power varies a lot on a log scale, so plain alternation wasn't
  enough to keep labels from colliding). Whole record only, not tied to the
  zoom/smoothing controls -- computed once when data loads, not per-render. In
  practice the modes it finds land squarely in ENSO's known ~2-7-year band (found six
  in the 1.5-4.8yr range on the full 1950-2026 record), which reads as the
  significance test behaving correctly rather than reporting noise. **Left for
  later:** comparing the surfaced dominant modes against known real-world cycles
  (11yr solar, ~20-30yr PDO, etc.) -- explicitly deferred, not forgotten; the plan is
  to look at what's actually dominant first, and only then go hunting for candidate
  explanations, not the other way around.

## Ground rules (apply to every workstream below)

- **No new backend**, except where a workstream explicitly says otherwise (the
  finer-grained-data workstream is the one case that might need to reconsider this).
- **Don't overclaim.** Where an idea implies data this project doesn't have (solar
  cycle numbers, a true wind vector field), the workstream says so and picks the
  honest version instead of quietly faking it.
- **Uncertainty is part of the deliverable, not a footnote.** Any new "rate" or
  "trend" number is shown as a range/band across history, not a single point estimate.

## Libraries needed, at a glance

| Workstream | New dependency | Notes |
|---|---|---|
| Rate-of-change / uncertainty | none | reuses fields already in `EnsoEvent` |
| Finer-grained data | likely yes -- see that workstream | gridded/NetCDF sources need real parsing, not a dependency this project already has |

## Process for each workstream

1. Implement against the file(s) named in that workstream.
2. `npx tsc --noEmit` (src) — this project's type-check gate.
3. Visual check in a real browser (the dashboard is client-rendered; a passing
   type-check doesn't prove a chart renders correctly).
4. If a workstream changes wording that also exists in `docs/definitions.md`, update
   both places in the same change so they can't drift apart.

## Workstreams, ordered by effort (smallest first)

### 1. Derivative / rate-of-change, with uncertainty -- Effort: Medium

**Status: partially shipped, sidelining the rest for later.** "Was the rate as fast in
previous El Niños" and "this is stochastic too" turned out to split into a shipped
piece and an open piece -- noting both here rather than pretending it's fully done.

**Steps:**
1. ~~Zero new data needed...~~ **Done.** `EnsoEvent` already carried `startDate`,
   `peakDate`, `peakOni`, `durationMonths`; onset rate is computed in `src/ui.ts`
   (`onsetRate`) and shown as its own sortable column in the event catalog table.
2. Historical onset-rate distribution view (strip/dot plot of all past onset rates,
   current one highlighted) -- **not built.** Still open.
3. ~~For the *live* month-to-month rate...~~ **Done, ONI only.** The ONI chart has a
   "rate of change" toggle (`src/charts.ts` `OniChartMode`, `src/stats.ts`
   `trailingSlope`, wired in `src/main.ts` via `toggle-oni-rate`) that swaps the line
   from level to a trailing 3-month linear-regression slope, not a raw diff -- the
   stochasticity concern this step was written for. Y-axis, title, and the ONI stat
   tile all relabel to match.

**Left for later (not step 2/3 above, a new ask):** the original request was that the
toggle affect *both* charts -- "on click both graphs change to be rates of change" --
not just ONI. Scoped to ONI-only for the first pass because extending derivative mode
to SOI/WWV/Wind means solving three different unit/scale problems on the shared
coupled chart at once, for a payoff nobody's asked for yet. Revisit if/when that's
actually wanted; the existing event-row-click zoom already gives a way to compare a
past episode's slope to the current one without it (flip the toggle on, click a row,
click back).

**ASK USER:** none blocking on what's left -- just deprioritized, not stuck.

**Depends on:** nothing -- KaTeX is already in the app if this needs to explain the
regression-slope choice.

---

### 2. Finer-grained data (daily/weekly) -- Effort: Large, and exploratory

The honest answer from checking NOAA/PMEL's own pages directly (not guessed): **none
of the 4 currently-sourced indices have a finer-than-monthly version at the endpoints
this project already uses.**

- **WWV**: PMEL's own `readme.txt` at `https://www.pmel.noaa.gov/tao/wwv/data/`
  states outright that WWV is a *monthly* index computed from NCEP GODAS. There is no
  daily/weekly WWV file at that source, period.
- **ONI, SOI, wind indices**: CPC's `oni.ascii.txt` / `soi` / `*850` files are
  published as monthly tables only, same as WWV.

So this workstream isn't "flip a flag" -- it's **swapping to different, higher-
resolution datasets for at least some variables**, which is a real scope decision, not
a quick add. Candidate sources, if this is ever revisited:

| Variable | Possible finer-grained source | Why it's a bigger lift than today |
|---|---|---|
| SST (ONI proxy) | NOAA OISST v2.1, daily 0.25° gridded | Gridded/NetCDF, not a flat ASCII table -- needs a spatial average over the Niño 3.4 box computed by this project, not just a parse |
| SOI | Australian BOM daily Tahiti/Darwin SLP | A different agency/format than CPC's monthly SOI; would need its own parser and its own standardization approach (CPC's baseline period isn't published, so matching it exactly may not be possible) |
| Trade winds | Reanalysis 850mb wind (e.g. NCEP/NCAR daily) | Also gridded/NetCDF; heavier than CPC's current flat sector indices |
| WWV | none identified | PMEL doesn't publish one; this variable likely stays monthly regardless of what happens with the other three |

**The data-update system needs to change too, not just get a new source.**
`data-prep/src/refresh.ts` currently shares **one** cache stamp
(`data-prep/raw/.last-refresh`) across all six files, throttled to once a week,
because every current source is monthly (see the comment at
`data-prep/src/refresh.ts:9-12`). A daily/weekly source checked only once a week would
be stale most of the time. If this workstream happens: **give the new source its own
stamp file and its own (much shorter) throttle window**, rather than lowering the
shared threshold for everyone -- the existing monthly sources still only need a
weekly check, and hammering CPC/PMEL daily for data that doesn't change that often
would be its own problem.

**ASK USER (before writing any code here):**
1. Is this actually wanted, or was surfacing the "monthly-only" fact (already done, see
   the footer note) sufficient? This is the largest, least-scoped item in the whole
   plan.
2. If wanted, which variable first? SST/OISST is probably the most requested
   ("daily ONI-like signal") but is also the most parsing work (gridded NetCDF, not a
   text table like everything this project currently parses).
3. Does a finer-grained series get its own separate chart/panel, or does it get
   resampled down to monthly so it can sit in the existing charts next to the other
   three variables? Mixing daily and monthly data in the same line chart without
   resampling would be misleading.

**Depends on:** nothing technically, but this is the workstream most likely to change
the "no new backend" ground rule (parsing gridded NetCDF client-side is impractical;
this would stay a `data-prep/` build-time job, just a much bigger one than today's).

---

### 3. Regional map, more layers (SST heatmap, wind channels) -- Effort: Large, exploratory

Not scoped yet -- flagged here so it isn't lost, not because it's ready to build. The
regional map (see "Already shipped") now has a real projected geographic base
(`Plot.geo` + an equirectangular projection + `world-atlas` coastlines), which is the
prerequisite this would build on -- adding a layer is a new `Plot.geo`/raster mark on
the same projection, not a rearchitecture.

- **SST heatmap** -- a colored raster/contour over the Niño 3.4 box (or the wider
  basin) showing sea-surface-temperature anomaly spatially, not just the single
  region-average number ONI already is. This needs *gridded* SST data (e.g. NOAA OISST,
  same source floated in workstream 3's table above) -- this project currently only
  has the one spatially-averaged ONI number, not a grid, so this is really "do
  workstream 3 for SST first," not an independent add.
- **Wind channels** -- streamlines/flow-line rendering across the basin instead of
  three arrows. Same honesty problem the current arrows are captioned around, just
  sharper: this project's wind data is three *zonal scalar* sectors (east/central/west
  850mb indices), not a 2D vector field, so a convincing streamline map would need a
  real gridded reanalysis wind product (e.g. NCEP/NCAR), not a prettier rendering of
  what's already sourced. Same "don't overclaim" ground rule that scoped the current
  arrows applies here, harder.

**ASK USER (before scoping either sub-item for real):** both sub-items reduce to "source
a new gridded dataset," which is the same category of decision as workstream 3 --
worth deciding together rather than defaulting into it.

**Depends on:** the regional map's projected base (shipped); realistically also
workstream 3, since both sub-items need gridded data this project doesn't have yet.

---

### 4. Layout density -- see everything without scrolling -- Effort: Medium, unscoped

Not scoped yet -- flagged here so it isn't lost, not because a design is settled. The
complaint: the page is currently one long vertical stack (map, event catalog, ONI
chart, coupled chart, stat tiles, controls bar all full-width, one after another), so
seeing the controls and the numbers they affect at the same time means scrolling back
and forth. This is a real layout/density problem, not a one-line fix -- it needs an
actual pass at the page grid, not just nudging one element.

Ideas floated, none committed yet:
- Smoothing control taking a partial-width slot (e.g. half-width, sitting beside or
  below a chart) instead of its own full-width bar.
- Stat tiles repositioned back near the ONI chart (they used to sit directly above it,
  before the "definition / history / current" reorder moved them to the bottom of the
  page) so the current numbers are visible alongside the chart that explains them.
- Resizing tiles/cards generally -- smaller stat tiles, denser controls -- to fit more
  of the dashboard into one viewport instead of one full-width card per section.

**ASK USER (before building anything here):**
1. Is the goal "fit more on screen via a real grid/columns layout" (e.g. stat tiles +
   smoothing control + a chart side by side on wide screens), or "shrink individual
   pieces" (smaller tiles, tighter spacing), or both?
2. Does the current section order (regional map -> event catalog -> ONI chart ->
   coupled chart -> stat tiles) still make sense once this is solved, or does solving
   "see things at once" mean abandoning the strict definition/history/current stack
   for something like a persistent sidebar/header of controls + current numbers with
   the historical charts scrolling independently below it?
3. Any target viewport/screen size this should be designed around, or should it just
   be "denser on wide screens, still a clean stack on narrow ones" (this project has no
   responsive breakpoints today -- everything just wraps).

**Depends on:** nothing technically, but this touches nearly every card's markup in
`src/main.ts` and the page grid in `src/style.css`, so it's worth agreeing on a
direction before touching code, not mid-refactor.
