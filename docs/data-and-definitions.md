---
title: enso-explained
margin: .2in
---

<style>
@import url("https://fonts.cdnfonts.com/css/latin-modern-roman");
@import url("https://fonts.cdnfonts.com/css/latin-modern-mono");

:root {
  --mono: "LMMono10", monospace;
  --serif: "LMRoman9", "CMU Serif", Georgia, serif;
}

@import url('https://fonts.googleapis.com/css2?family=PT+Mono&display=swap');

.doc {
  /*font-family: var(--serif);*/
  font-family: 'PT Mono', monospace;
}

.katex {
    font-size:1em;
}

table {
  margin: auto;
  border-collapse: collapse;
}

td, th {
  border: 1px solid;
  padding: 4px 8px;
}
</style>

<div class=doc>

### Definitions

This project sources **four** real time series from NOAA/PMEL — ONI, SOI, WWV, and a
Trade Wind Index. Two variables from the classic ENSO picture (thermocline depth, Walker
Circulation) are **not** separately sourced; they're approximated by proxies among those
four. §1 lays out exactly which is which.

## 1. Variables actually used

The full ENSO picture is usually described as an ocean side and an atmosphere side. This
project sources one directly-measured variable per side, plus one that stands in as a
proxy for a second, related variable.

### Ocean state

| Concept | What's sourced | Sourced or proxy? |
|---|---|---|
| Sea surface temperature | **ONI** | Directly sourced |
| Subsurface heat content | **WWV** | Directly sourced |
| Thermocline depth | *(no separate dataset)* — approximated by WWV | Proxy |

**ONI** (Oceanic Niño Index) is the 3-month running mean of ERSST.v5 sea surface
temperature anomalies in the Niño 3.4 region (5°N–5°S, 120°–170°W) — the index NOAA has
historically used to declare El Niño/La Niña episodes.[^oni]

**WWV** (Warm Water Volume) is the volume of water above the 20°C isotherm, integrated
over 5°S–5°N, 120°E–80°W, produced by NOAA/PMEL from the TAO/TRITON mooring array.[^wwv]
Deeper thermoclines hold more warm water, so a *shortage or surplus* of WWV tracks a
*shallower or deeper* thermocline — but this project never fetches thermocline depth
itself, only WWV.

### Atmospheric state

| Concept | What's sourced | Sourced or proxy? |
|---|---|---|
| Air-pressure difference (SOI) | **SOI** | Directly sourced |
| Trade winds | **Trade Wind Index** | Directly sourced |
| Walker Circulation | *(no separate dataset)* — approximated by Trade Wind Index | Proxy |

**SOI** (Southern Oscillation Index) is the standardized Tahiti-minus-Darwin sea-level
pressure difference — the east-west atmospheric pressure gradient across the equatorial
Pacific.[^soi]

**Trade Wind Index** is an 850mb zonal wind index (m/s) in three Pacific sectors (East,
Central, West).[^bjerknes] The trade winds are the *surface* branch of the Walker
Circulation — when they weaken, that *is* a weakening Walker cell — so this project reads
the winds directly rather than fetching a separate Walker Circulation index (e.g. an OLR
or velocity-potential product).

### Sources & baselines

| Variable | Source file | Record starts | Baseline |
|---|---|---|---|
| ONI | [`oni.ascii.txt`](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt) | 1950 | NOAA's own centered 30-year base periods, updated every 5 years[^oni] |
| SOI | [`soi`](https://www.cpc.ncep.noaa.gov/data/indices/soi) (2nd table, "STANDARDIZED DATA") | 1951 | Standardized by CPC before publication; base period not stated on their page |
| WWV | [`wwv.dat`](https://www.pmel.noaa.gov/tao/wwv/data/wwv.dat) | 1980 | Raw + NOAA anomaly used as-is; this project *additionally* computes a 1991–2020 z-score (§3) so it's comparable to the wind index |
| Trade Wind Index | [`epac850`](https://www.cpc.ncep.noaa.gov/data/indices/epac850) / [`cpac850`](https://www.cpc.ncep.noaa.gov/data/indices/cpac850) / [`wpac850`](https://www.cpc.ncep.noaa.gov/data/indices/wpac850) | 1979 | Published as a raw index, not an anomaly; this project computes a 1991–2020 z-score (§3) |

All raw files are committed under `data-prep/raw/`; regenerate the derived JSON with
`npm run data:build` after re-downloading updated copies (see main README).

[^oni]: NOAA CPC, ["ONI: Historical El Niño / La Niña episodes"](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php): "Warm (red) and cold (blue) periods are based on a threshold of +/- 0.5°C for the Oceanic Niño Index (ONI), [a] 3 month running mean of ERSST.v5 SST anomalies in the Niño 3.4 region (5°N-5°S, 120°-170°W)...using centered 30-year base periods updated every 5 years." Note: as of NWS Public Information Statement 26-05, NOAA's *official* real-time ENSO monitoring/prediction has moved to the Relative Oceanic Niño Index (RONI); ONI is retained here for its longer historical record (back to 1950) and because it's what the classification literature in §2 is stated in terms of.
[^soi]: [NOAA CPC SOI description](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensocycle/soi.shtml): "calculated based on the differences in air pressure anomaly between Tahiti and Darwin, Australia."
[^wwv]: Meinen, C.S. and M.J. McPhaden (2000), ["Observations of warm water volume changes in the equatorial Pacific and their relationship to El Niño and La Niña"](https://www.pmel.noaa.gov/pubs/outstand/mein2119/mein2119.shtml), *J. Climate*: "Water above the 20°C isotherm is defined as 'warm water'...WWV is determined by spatial integration...over the region 5°S-5°N, 120°E-80°W;" extrema in WWV precede extrema in Niño-3 SST by several months, "supporting WWV's value as an early indicator." See also Neske & McGregor (2018), *GRL*, on WWV as an ENSO precursor.
[^bjerknes]: NOAA Climate.gov, ["The Rise of El Niño and La Niña"](https://www.climate.gov/news-features/blogs/enso/rise-el-ni%C3%B1o-and-la-ni%C3%B1a): "The feedback begins when the trade winds weaken and/or the sea surface temperatures warm...leading to increased rising motion...meanwhile, the trade winds...weaken...These weaker surface winds then...result in the reduction of the cold-water upwelling...Now the winds are acting to reinforce the initial oceanic warming!" This ocean-atmosphere feedback is classically attributed to Bjerknes, J. (1969), "Atmospheric teleconnections from the equatorial Pacific," *Monthly Weather Review* 97(3).

<div style="page-break-before: always;" / >

## 2. Defining El Niño / Super El Niño

**Primary rule — ONI onset/duration:**

- **El Niño**: ONI ≥ **+0.5°C** for at least **5 consecutive overlapping seasons**.
- **La Niña** (kept for contrast/shading): ONI ≤ **−0.5°C** for at least 5 consecutive seasons.

Source: NOAA CPC — "periods of below and above normal sea surface temperatures are
colored in blue and red when the threshold [+/- 0.5°C] is met for a minimum of 5
consecutive overlapping seasons."[^oni]

> **Isn't ONI just sea surface temperature — so why track SOI, WWV, and wind at all?**
> Yes: ONI is a pure-SST rule, and it's used as the *primary* classifier only because
> it's NOAA's own long-standing definition and the longest continuous record (back to
> 1950). But El Niño is physically a *coupled* ocean-atmosphere event, not just warm
> water. So every ONI-qualified event is run through a second, independent check — §2.2
> below — that looks at SOI, WWV, and trade winds and asks whether they moved the way the
> Bjerknes feedback predicts. ONI decides *whether an episode is named*; the coupled
> check decides *whether it looks like a real, physically-coupled ENSO event* rather than
> an isolated warm SST reading.

### 2.1 Strength tier

From the peak ONI reached during the episode:

| Tier | \|ONI\| |
|---|---|
| Weak | 0.5 – 0.9 |
| Moderate | 1.0 – 1.4 |
| Strong | 1.5 – 1.9 |
| **Very Strong ("Super El Niño")** | **≥ 2.0** |

These exact 0.5-wide bins (and the weak/moderate/strong/very-strong labels) are NOAA
CPC's own strength categories, published for their current official ENSO index (RONI, not
ONI).[^strength] Applying the same bins to ONI is the long-standing convention in ENSO
reporting from before RONI existed, corroborated independently by e.g. the Midwestern
Regional Climate Center's ENSO reference page.[^mrcc] Readers should know this isn't
NOAA's own stated ONI-specific cutoff — NOAA's current per-index cutoff table is for
RONI.

### 2.2 Coupled-signature cross-check

The El Niño / La Niña cycle is driven by a well-documented positive feedback (the
"Bjerknes feedback"):

1. Weakening trade winds let warm water build up / upwelling of cold water lessen in the
   eastern Pacific.
2. That raises eastern SST.
3. That reduces the west-to-east SST gradient — and with it, the Tahiti-Darwin pressure
   gradient that SOI measures.
4. A weaker pressure gradient weakens the trade winds further, closing the loop.[^bjerknes]

A real coupled event should show SST, pressure (SOI), heat content (WWV), and trade winds
all moving together — not just a warm ONI reading in isolation. So for every ONI-qualified
event, the pipeline also averages, over the same date window:

- mean **SOI** (expect **negative**),
- mean **WWV z-score** (expect **positive** — more heat content, consistent with a deeper thermocline),
- mean **East Pacific trade wind z-score** (expect **negative** — weaker trade winds).

If all three move in the expected direction, the event is flagged `confirmed: true`. If
ONI qualifies but the other legs don't corroborate, it's `confirmed: false` — not dropped,
just flagged, since a single-region SST index can occasionally decouple from the rest of
the basin. Pre-1979/1980 events (before wind/WWV records begin) are `confirmed: null` —
indeterminate for lack of data. La Niña events use the mirrored signs.

This logic lives in `data-prep/src/classify.ts`; it is this project's own
operationalization of the feedback loop, not a published NOAA test.

### 2.3 Sanity check against known history

This rule reproduces the same episodes NOAA lists as its strongest on record —
1972–73, 1982–83, 1997–98, 2015–16, and 2023–24 — as `very-strong-el-nino` here, with
1982–83 and 2015–16 additionally showing a fully confirmed coupled signature by the
cross-check above.[^strongest]

[^strength]: NOAA CPC, ["Official NOAA CPC ENSO Strength Probabilities"](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/strengths/): probabilities are given for 9 bins -- "Index ≤ -2.0°C," "-1.5°C ≥ Index > -2.0°C," ... up to "Index ≥ 2.0°C" -- and "the color shading within the bars indicates the chances of different categories of El Niño or La Niña strength (weak, moderate, strong, and very strong)." "Probabilities are verified using the Relative Oceanic Niño Index (RONI)...The 1991–2020 climatological base period is used to define the departures."
[^mrcc]: [Midwestern Regional Climate Center, "ENSO Indices and Past Events"](https://www.mrcc.purdue.edu/climate_watch/special_topics/enso-indices-and-past-events): El Niño is "weak when ONI values are between 0.5-0.9, moderate from 1.0-1.4, and strong for greater than 1.5" (mirrored for La Niña); this secondary source does not itself use a "very strong" label or cite an official NOAA document for the cutoffs.
[^strongest]: Computed directly from the committed [`oni.ascii.txt`](https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt) via `data-prep/src/classify.ts` (re-derive with `npm run data:build`), ranking `very-strong-el-nino` events by peak ONI: 2014–16 (2.75, Dec 2015), 1997–98 (2.40, Nov 1997), 1982–83 (2.23, Dec 1982), 1972–73 (2.12, Dec 1972), 2023–24 (2.06, Dec 2023). These peak values will drift slightly (hundredths of a degree) release to release as NOAA revises ERSST.v5, so treat the ranking, not the exact decimals, as the durable claim.

<div style="page-break-before: always;" / >

## 3. The physics as equations

Two different kinds of equations come up here, and it's worth keeping them separate:
what this pipeline actually computes (plain statistics), versus how climate scientists
model the feedback loop dynamically (differential equations this project does *not*
solve, included for context on where "diff eq's" actually enter ENSO physics).

### 3.1 What this project computes

Per-calendar-month anomaly, used for WWV and the trade-wind indices
(`data-prep/src/baseline.ts`):

$$z_{y,m} = \frac{x_{y,m} - \mu_m}{\sigma_m}$$

$x_{y,m}$ is the raw value in year $y$, calendar month $m$ (all Januaries share one
$\mu_m,\sigma_m$); $\mu_m,\sigma_m$ are the mean and sample standard deviation of that
calendar month over the 1991–2020 baseline.[^zscore] This removes the seasonal cycle
instead of conflating it with the anomaly.

ONI itself (published by NOAA, not computed here) is a running seasonal mean:

$$\mathrm{ONI}_t = \frac{1}{3}\sum_{k=0}^{2} \mathrm{SST}'_{t-k}$$

the mean of 3 consecutive monthly Niño 3.4 SST anomalies $\mathrm{SST}'$ — why NOAA calls
each reading an "overlapping season" rather than a single month.[^oni]

### 3.2 The feedback loop as a dynamical system

§2.2's loop (weaker winds → warmer eastern SST → weaker SOI → weaker winds) is a
description in words, not an equation. The standard reduced model climate scientists use
to write it as an actual system of ODEs is the **recharge oscillator**:[^recharge]

$$\frac{dT}{dt} = R\,T + F_1\,h$$

$$\frac{dh}{dt} = -\epsilon\, h - F_2\, T$$

- $T$ — eastern Pacific SST anomaly (≈ what ONI tracks)
- $h$ — equatorial Pacific thermocline-depth anomaly (≈ what WWV proxies)
- $R>0$ — growth rate from the Bjerknes feedback (weak winds → warm SST, reinforcing)
- $\epsilon$ — basin-adjustment damping (ocean Rossby/Kelvin wave transit)
- $F_1, F_2$ — coupling terms linking the two variables

This project doesn't solve this system — no ODE is integrated in `data-prep/`, only
observed data is classified — but it's the textbook dynamical form of the exact feedback
loop the §2.2 cross-check tests for empirically.

[^zscore]: `data-prep/src/baseline.ts`, `toMonthlyClimatologyZScore()`: computes $\mu_m,\sigma_m$ (sample standard deviation, $N-1$ denominator) per calendar month over 1991–2020, then applies them to the full series.
[^recharge]: Jin, F.-F. (1997), "An Equatorial Ocean Recharge Paradigm for ENSO. Part I: Conceptual Model," *J. Atmos. Sci.*, 54, 811–829; equation form as restated in Vialard et al. (2025), ["The El Niño–Southern Oscillation (ENSO) Recharge Oscillator Conceptual Model: Achievements and Future Prospects"](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2024RG000843), *Reviews of Geophysics*.

<div style="page-break-before: always;" / >

## 4. Architecture decisions

- **Build-time pipeline, not a live API call.** `data-prep/` is a Node/TypeScript script
  (`npm run data:build`) that reads the already-downloaded raw NOAA text files, parses,
  merges, and classifies them, then writes static JSON (`public/data/enso-monthly.json`,
  `public/data/enso-events.json`) for the browser to load. NOAA's CPC/PMEL endpoints don't
  send an `Access-Control-Allow-Origin` header (checked directly with `curl -I` against
  `oni.ascii.txt` and `wwv.dat`), so an in-browser `fetch` from the dashboard's own origin
  would be blocked by CORS; the underlying data also only updates monthly, so a build-time
  refresh is both more robust and faster than fetching live on every page load. To refresh:
  re-download the six files in `data-prep/raw/`, then rerun `npm run data:build`.
- **Fixed-width parsing, not whitespace-split.** Several NOAA tables (`soi`, `*850`) pack
  each monthly value into an exact 6-character field with no guaranteed separating space
  — a run of negative numbers can render as `...-1.4-999.9...` — which breaks a naive
  `split(/\s+/)`. `data-prep/src/fixedWidthTable.ts` slices by fixed column position
  instead (see its header-detection logic for locating the right table within files that
  stack more than one, like `soi`'s raw-anomaly-then-standardized layout).
  `-999.9` placeholder rows (NOAA's forecast-year filler) are dropped during parsing.
- **Per-calendar-month z-scores, not a flat mean/std.** WWV volume and the trade wind
  indices both carry a strong annual seasonal cycle. `data-prep/src/baseline.ts`
  computes mean/std separately for each calendar month within the 1991–2020 baseline
  (e.g. Junes compared only to other Junes), isolating the anomaly instead of conflating
  it with the seasonal cycle.
- **A new sibling project, not an extension of `csv-parser/`.** `csv-parser/` is
  documented as a from-scratch TypeScript/papaparse learning exercise with its own
  incremental history, and its `data/` folder (World Bank GDP/CO2/population indicators)
  has no ENSO content — repurposing it would conflate a learning artifact with the real
  deliverable. `enso-dashboard/` reuses the same toolchain (TypeScript, Observable Plot)
  but is purpose-built.
- **Client-side rendering, not the `csv-parser` jsdom/sharp approach.** `csv-parser`
  renders Observable Plot server-side to a static PNG/SVG via a fake jsdom DOM. This
  dashboard instead ships Observable Plot to the browser and renders directly against
  the real DOM (Vite + TypeScript, `npm run dev`), which is what makes it interactive —
  tooltips, zoom/brush, filtering — rather than a static image.
