# Research: Programmatic Regional PMTiles Extraction (Server-Side)

## Executive Summary

`go-pmtiles` v1.30.1 is a single Go binary that extracts regional subsets from a remote PMTiles planet file via HTTP range requests — it never downloads the full 120 GB planet. A US state at z0-z14 runs roughly 500 MB–3 GB depending on geography and data density; at z15 sizes roughly double again. The npm `pmtiles` package is read-only and cannot extract or write archives — all write operations require the CLI. FEMA's 10 regions and all 50-state bounding boxes are fully documented below.

## Problem Statement

The Attic AI needs to ship pre-extracted regional PMTiles files for offline use. The workflow: on admin trigger, run `pmtiles extract` against the Protomaps daily planet build (remote HTTPS), produce a `.pmtiles` output scoped to a FEMA region or individual state at a controlled zoom ceiling, then serve it locally. This must run in a Node.js/shell context (AdonisJS sidecar or BullMQ job) without downloading the full planet.

---

## Technology Evaluation

### Option A: go-pmtiles CLI — RECOMMENDED

**Version:** v1.30.1 (released 2025-03-03)  
**Repo:** https://github.com/protomaps/go-pmtiles  
**Install:** Single static binary, no runtime dependencies.

**Available build targets (GitHub Releases assets):**
- `go-pmtiles_{version}_Linux_x86_64.zip`
- `go-pmtiles_{version}_Linux_arm64.zip`
- `go-pmtiles_{version}_Darwin_x86_64.zip`
- `go-pmtiles_{version}_Darwin_arm64.zip` ← M4 MacBook Pro target
- `go-pmtiles_{version}_Windows_x86_64.zip`
- Docker: `protomaps/go-pmtiles` on Docker Hub

**Install on macOS (Apple Silicon):**
```bash
brew install protomaps/protomaps/go-pmtiles
# or manual:
curl -L https://github.com/protomaps/go-pmtiles/releases/download/v1.30.1/go-pmtiles_1.30.1_Darwin_arm64.zip -o pmtiles.zip
unzip pmtiles.zip && chmod +x pmtiles && mv pmtiles /usr/local/bin/
```

**Install on Linux (for Docker/server):**
```bash
curl -L https://github.com/protomaps/go-pmtiles/releases/download/v1.30.1/go-pmtiles_1.30.1_Linux_x86_64.zip -o pmtiles.zip
unzip pmtiles.zip && chmod +x pmtiles && mv pmtiles /usr/local/bin/
```

#### Exact extract syntax

```bash
# Minimal — bbox from remote source
pmtiles extract \
  https://build.protomaps.com/20260217.pmtiles \
  output.pmtiles \
  --bbox=MIN_LON,MIN_LAT,MAX_LON,MAX_LAT \
  --maxzoom=14

# Full production flags
pmtiles extract \
  https://build.protomaps.com/20260217.pmtiles \
  output.pmtiles \
  --bbox=-124.41,32.53,-114.13,42.01 \  # California
  --maxzoom=14 \
  --download-threads=4 \
  --overfetch=0.05

# Dry run — shows estimated tile count + size, no download
pmtiles extract \
  https://build.protomaps.com/20260217.pmtiles \
  output.pmtiles \
  --bbox=-124.41,32.53,-114.13,42.01 \
  --maxzoom=14 \
  --dry-run

# GeoJSON polygon instead of bbox (for irregular region shapes)
pmtiles extract \
  https://build.protomaps.com/20260217.pmtiles \
  output.pmtiles \
  --region=fema_region_9.geojson \
  --maxzoom=14
```

**Flag reference:**

| Flag | Default | Notes |
|------|---------|-------|
| `--bbox` | — | `west,south,east,north` decimal degrees WGS84 |
| `--maxzoom` | source max (15) | Controls tile depth and output size |
| `--minzoom` | 0 | Removing overview levels costs more requests than it saves; avoid |
| `--download-threads` | 1 | Set 4–8 for HTTP sources; major throughput gain |
| `--overfetch` | 0.10 | 0.05 = 5% extra fetched to batch small nearby requests; lower = more precise but more round-trips |
| `--dry-run` | false | Prints tile count + estimated bytes, writes nothing |
| `--region` | — | GeoJSON Polygon/MultiPolygon/Feature/FeatureCollection |

#### HTTP range request behavior

The tool uses HTTP range requests exclusively — it reads only tile directory pages then fetches exactly the tile data needed. It does NOT download the full planet. For a Berlin extract (71 MB output), only 64 HTTP requests totaling 77 MB of transferred data were needed. For a US+Mexico extract (17 GB output), 357 range requests transferred 18 GB (the overfetch margin).

**The source archive must be clustered** (Protomaps planet builds are clustered by default).

#### Performance benchmarks (real-world from issue #68)

| Extract | Output Size | Time | Threads | Notes |
|---------|------------|------|---------|-------|
| Switzerland (local file) | 180 MB | < 1 second | — | Local I/O |
| Berlin (HTTP) | 71 MB | 16.6s | 4 | 64 requests |
| Puglia, Italy (HTTP) | ~200 MB | — | — | z0-z14 |
| US + Mexico (S3) | 17 GB | 9m24s | 1 | z0-z15, 28k tiles/s |

**Projection for a single US state at z14 over HTTPS (estimated):**
- Small state (CT, DE, RI): 50–200 MB, ~30–90 seconds
- Medium state (CO, TN, VA): 400 MB–1.2 GB, ~2–5 minutes
- Large state (CA, TX, MT): 1–3 GB, ~5–15 minutes

With `--download-threads=4`, expect 3–4x speedup on I/O-bound extracts.

---

### Option B: pmtiles npm package — READ-ONLY, extraction NOT possible

**Version:** 4.4.0 (published ~January 2026)  
**Install:** `npm i pmtiles`

The JS library is a **decoder only**. It can open a local or remote `.pmtiles` file and read individual tiles via `getTile(z, x, y)`, inspect metadata, and iterate tile entries — but it cannot write, extract, or subset archives. There is no `extract()` or `subset()` API. All write operations require the Go CLI.

**Use cases for the npm package in this project:**
- Serving tiles from a local `.pmtiles` file in an Express/AdonisJS handler
- Validating a completed extract (header inspection, tile count)
- Building a tile server that reads the extracted regional file

---

### Option C: Python pmtiles — AVOID for extraction

`pip install pmtiles` provides a Python reader library but no extraction CLI. The Go binary is the only maintained extraction tool.

---

## File Sizes by Zoom Level

Planet total: ~120 GB (z0–z15). Each zoom level roughly doubles size.

| Maxzoom | Planet fraction | Approx single large US state (CA/TX) | Approx FEMA region |
|---------|----------------|--------------------------------------|-------------------|
| z12 | ~6% | 300–600 MB | 1–3 GB |
| z13 | ~12% | 600 MB–1.2 GB | 2–5 GB |
| z14 | ~25% | 1–2.5 GB | 4–10 GB |
| z15 (max) | ~50% | 2–5 GB | 8–20 GB |

**Street-level detail:**
- z14 = street names, most POIs, building outlines. Sufficient for emergency response navigation.
- z15 = fine building footprints, alleys, detailed POI. Marginal gain for most use cases; doubles size.
- **Recommendation: z14 for offline emergency use.** z12 for overview-only (regional situational awareness).

**Zoom level semantics (Protomaps basemap):**
- z0–z5: continents, countries
- z6–z9: regions, major cities
- z10–z12: city neighborhoods, highways, major roads
- z13–z14: streets, POIs, building blocks
- z15: max detail — individual buildings, alleys

---

## Architecture Patterns Found

**Pattern 1: BullMQ job triggers CLI subprocess**
```typescript
// In a BullMQ worker
import { execa } from 'execa'

async function extractRegion(bbox: string, maxzoom: number, outputPath: string) {
  const planetUrl = `https://build.protomaps.com/${LATEST_BUILD}.pmtiles`
  await execa('pmtiles', [
    'extract', planetUrl, outputPath,
    `--bbox=${bbox}`,
    `--maxzoom=${maxzoom}`,
    '--download-threads=4',
    '--overfetch=0.05',
  ], { timeout: 30 * 60 * 1000 }) // 30 min ceiling
}
```

**Pattern 2: Dry-run size check before committing download**
```bash
pmtiles extract SOURCE OUTPUT --bbox=BBOX --maxzoom=14 --dry-run
# parse stdout for estimated_bytes before pulling trigger
```

**Pattern 3: Serve extracted file with pmtiles npm package (AdonisJS)**
```typescript
import { PMTiles, FetchSource } from 'pmtiles'
// Open local file
const source = new NodeFileSource('/data/maps/fema-region-9.pmtiles')
const tiles = new PMTiles(source)
const tile = await tiles.getZxy(z, x, y)
```

---

## Key APIs and Services

**Protomaps daily planet build:**
- URL pattern: `https://build.protomaps.com/YYYYMMDD.pmtiles`
- Latest always: check https://maps.protomaps.com/builds/ for current date
- No auth required, public HTTP
- No official rate limits documented; use `--download-threads=4` (not 16+)
- Range requests supported — confirmed working

**OpenFreeMap (alternative source):**
- URL: `https://data.source.coop/openfreemap/...`
- Also clustered PMTiles, same extract workflow applies

---

## Known Pitfalls and Risks

1. **Alaska antimeridian crossing.** The naive bounding box `(-179.15, 51.21, 179.78, 71.37)` spans the antimeridian and may produce incorrect results or double the download. Split into two extracts: western Alaska `(172.48, 51.22, 180.0, 71.41)` + eastern Alaska `(-180.0, 51.22, -129.99, 71.41)` and merge, or use `--region` with a GeoJSON MultiPolygon.

2. **Source must be clustered.** `pmtiles extract` will fail with a non-clustered source. Protomaps planet builds are always clustered. Verify with `pmtiles show SOURCE | grep clustered`.

3. **No incremental updates.** PMTiles is immutable. A new planet build requires a full re-extract; there is no diff/patch workflow. Schedule re-extracts when a new planet build is needed.

4. **Timeout budget in BullMQ jobs.** A FEMA region at z14 can take 10–20 minutes over HTTPS. Set BullMQ job timeout to at least 30 minutes. Use `--dry-run` first to size-gate jobs.

5. **Disk space during extraction.** The output file is written incrementally but the working directory needs headroom for the full extract size plus ~10% overfetch buffer. Check available disk before queuing.

6. **Protomaps URL changes.** The planet URL includes a build date. Scrape https://maps.protomaps.com/builds/ or https://build.protomaps.com/ index to find the latest build programmatically — do not hardcode a date.

7. **`--minzoom` increases request count.** Omitting low zoom levels is rarely worth the extra HTTP overhead. Default to z0 as minzoom always.

---

## FEMA Regions (All 10)

| Region | HQ | States / Territories |
|--------|----|----------------------|
| 1 | Boston, MA | CT, ME, MA, NH, RI, VT |
| 2 | New York, NY | NJ, NY, PR, USVI |
| 3 | Philadelphia, PA | DC, DE, MD, PA, VA, WV |
| 4 | Atlanta, GA | AL, FL, GA, KY, MS, NC, SC, TN |
| 5 | Chicago, IL | IL, IN, MI, MN, OH, WI |
| 6 | Denton, TX | AR, LA, NM, OK, TX |
| 7 | Kansas City, MO | IA, KS, MO, NE |
| 8 | Denver, CO | CO, MT, ND, SD, UT, WY |
| 9 | Oakland, CA | AZ, CA, HI, NV, GU, AS, CNMI |
| 10 | Bothell, WA | AK, ID, OR, WA |

### FEMA Region Bounding Boxes (computed from state extents, WGS84: west,south,east,north)

```
# Region 1 — New England (CT, ME, MA, NH, RI, VT)
-73.728,40.980,-66.950,47.460

# Region 2 — NY/NJ + Caribbean (NJ, NY, PR, USVI)
# CONUS portion only:
-79.762,38.929,-71.856,45.016
# With Caribbean (separate extract recommended):
PR: -67.945,17.883,-65.221,18.516
USVI: -65.085,17.674,-64.565,18.413

# Region 3 — Mid-Atlantic (DC, DE, MD, PA, VA, WV)
-83.675,37.201,-74.690,42.270

# Region 4 — Southeast (AL, FL, GA, KY, MS, NC, SC, TN)
-90.310,24.523,-75.460,39.147

# Region 5 — Great Lakes (IL, IN, MI, MN, OH, WI)
-97.239,36.970,-82.413,49.384

# Region 6 — South-Central (AR, LA, NM, OK, TX)
-109.050,25.837,-88.817,37.003

# Region 7 — Plains (IA, KS, MO, NE)
-104.054,35.996,-90.140,43.501

# Region 8 — Mountain (CO, MT, ND, SD, UT, WY)
-116.050,36.993,-96.437,49.001

# Region 9 — Pacific (AZ, CA, HI, NV) — CONUS+HI only
# AZ+CA+NV contiguous:
-124.410,31.332,-109.041,42.010
# HI separate:
-178.335,18.910,-154.807,28.402
# GU separate:
144.618,13.234,144.957,13.654
# AS separate:
-171.090,-14.549,-168.143,-11.047

# Region 10 — Pacific Northwest (AK, ID, OR, WA)
# ID+OR+WA:
-124.763,41.988,-111.044,49.002
# AK: use split extracts (antimeridian) — see pitfall #1
```

---

## Bounding Boxes — All 50 States + DC + Territories

Format: `west,south,east,north` (pmtiles --bbox order)

```
# CONUS bounding box (contiguous 48 + DC)
-124.763,24.523,-66.950,49.384

# Individual states (from 2017 US Census 1:500k, NAD83 ≈ WGS84)
AL (Alabama):              -88.473,30.223,-84.889,35.008
AK (Alaska):               split — see antimeridian note above
AZ (Arizona):              -114.817,31.332,-109.045,37.004
AR (Arkansas):             -94.618,33.004,-89.644,36.500
CA (California):           -124.410,32.534,-114.131,42.010
CO (Colorado):             -109.060,36.992,-102.042,41.003
CT (Connecticut):          -73.728,40.980,-71.787,42.051
DE (Delaware):             -75.789,38.451,-75.049,39.839
DC (Dist. of Columbia):    -77.120,38.792,-76.909,38.995
FL (Florida):              -87.635,24.523,-80.031,31.001
GA (Georgia):              -85.605,30.358,-80.840,35.001
HI (Hawaii):               -178.335,18.910,-154.807,28.402
ID (Idaho):                -117.243,41.988,-111.044,49.001
IL (Illinois):             -91.513,36.970,-87.495,42.508
IN (Indiana):              -88.098,37.772,-84.785,41.761
IA (Iowa):                 -96.640,40.376,-90.140,43.501
KS (Kansas):               -102.052,36.993,-94.588,40.003
KY (Kentucky):             -89.572,36.497,-81.965,39.147
LA (Louisiana):            -94.043,28.929,-88.817,33.019
ME (Maine):                -71.084,42.978,-66.950,47.460
MD (Maryland):             -79.488,37.912,-75.049,39.723
MA (Massachusetts):        -73.508,41.238,-69.928,42.887
MI (Michigan):             -90.418,41.696,-82.413,48.239
MN (Minnesota):            -97.239,43.499,-89.492,49.384
MS (Mississippi):          -91.655,30.174,-88.098,34.996
MO (Missouri):             -95.775,35.996,-89.099,40.614
MT (Montana):              -116.050,44.358,-104.039,49.001
NE (Nebraska):             -104.054,40.000,-95.308,43.002
NV (Nevada):               -120.006,35.002,-114.040,42.002
NH (New Hampshire):        -72.557,42.697,-70.611,45.305
NJ (New Jersey):           -75.560,38.929,-73.894,41.357
NM (New Mexico):           -109.050,31.332,-103.002,37.000
NY (New York):             -79.762,40.496,-71.856,45.016
NC (North Carolina):       -84.322,33.842,-75.461,36.588
ND (North Dakota):         -104.049,45.935,-96.555,49.001
OH (Ohio):                 -84.820,38.403,-80.519,41.978
OK (Oklahoma):             -103.003,33.616,-94.431,37.002
OR (Oregon):               -124.566,41.992,-116.464,46.292
PA (Pennsylvania):         -80.520,39.720,-74.690,42.270
RI (Rhode Island):         -71.863,41.146,-71.121,42.019
SC (South Carolina):       -83.354,32.035,-78.542,35.215
SD (South Dakota):         -104.058,42.480,-96.437,45.946
TN (Tennessee):            -90.310,34.983,-81.647,36.678
TX (Texas):                -106.646,25.837,-93.508,36.501
UT (Utah):                 -114.053,36.998,-109.041,42.002
VT (Vermont):              -73.438,42.727,-71.465,45.017
VA (Virginia):             -83.675,36.541,-75.242,39.466
WA (Washington):           -124.763,45.544,-116.916,49.002
WV (West Virginia):        -82.645,37.201,-77.720,40.639
WI (Wisconsin):            -92.888,42.492,-86.805,47.081
WY (Wyoming):              -111.057,40.995,-104.052,45.006

# Territories
PR (Puerto Rico):           -67.945,17.883,-65.221,18.516
USVI (US Virgin Islands):   -65.085,17.674,-64.565,18.413
GU (Guam):                  144.618,13.234,144.957,13.654
AS (American Samoa):        -171.090,-14.549,-168.143,-11.047
MP (N. Mariana Islands):    144.886,14.110,146.065,20.554
```

---

## Recommended Stack

```
Tool:         go-pmtiles v1.30.1 binary (Darwin arm64 for M4 dev, Linux x86_64 for Docker)
Invocation:   execa() from BullMQ worker job (with 30-min timeout)
Zoom ceiling: z14 for full street detail; z12 for overview-only packages
Threading:    --download-threads=4 (safe for Protomaps public CDN)
Overfetch:    --overfetch=0.05 (5% — good balance of batching vs. waste)
Pre-flight:   --dry-run to estimate size before committing bandwidth
Source URL:   https://build.protomaps.com/{YYYYMMDD}.pmtiles (scrape latest build date)
Serving:      pmtiles npm v4.4.0 NodeFileSource for local tile serving in AdonisJS
Region scope: FEMA region boundaries for grouping; state-level as smallest atom
```

**Node.js invocation pattern:**
```typescript
import { execa } from 'execa'
import { env } from '#start/env'

const PLANET_URL = `https://build.protomaps.com/${env.get('PROTOMAPS_BUILD_DATE')}.pmtiles`

export async function extractRegion(params: {
  bbox: string      // "west,south,east,north"
  maxzoom: number
  outputPath: string
}): Promise<void> {
  const { stdout } = await execa('pmtiles', [
    'extract', PLANET_URL, params.outputPath,
    `--bbox=${params.bbox}`,
    `--maxzoom=${params.maxzoom}`,
    '--download-threads=4',
    '--overfetch=0.05',
  ], {
    timeout: 30 * 60 * 1000,
  })
}
```

---

## Open Questions

1. **Protomaps planet build cadence** — Is the latest build published daily or weekly? Need to confirm update frequency before designing a cache-invalidation strategy for pre-extracted files.
2. **Disk budget per FEMA region at z14** — Real measurements needed. Estimate is 4–10 GB/region; actual may vary significantly for urban-dense regions (R2, R5) vs sparse (R8).
3. **Alaska handling decision** — Antimeridian split adds complexity. Does the product need AK offline maps? If yes, decide: two extract + merge vs. GeoJSON `--region` approach.
4. **Pacific territories** — GU, AS, CNMI are in FEMA Region 9 but at extreme longitudes. Each needs its own extract. Include in default Region 9 package or as optional add-ons?
5. **Re-extract trigger** — On a new planet build, which regions get re-extracted automatically? All 10? User-selected? Alert operator and require manual trigger?

---

## Sources

- [pmtiles CLI | Protomaps Docs](https://docs.protomaps.com/pmtiles/cli)
- [go-pmtiles GitHub Releases](https://github.com/protomaps/go-pmtiles/releases)
- [pmtiles extract feedback thread — Issue #68](https://github.com/protomaps/go-pmtiles/issues/68)
- [Basemap Downloads | Protomaps Docs](https://docs.protomaps.com/basemaps/downloads)
- [pmtiles npm package](https://www.npmjs.com/package/pmtiles)
- [FEMA Regions | FEMA.gov](https://www.fema.gov/about/organization/regions)
- [Bounding Boxes for All US States — Anthony D'Agostino](https://anthonylouisdagostino.com/bounding-boxes-for-all-us-states/)
- [US State Bounding Boxes CSV Gist](https://gist.github.com/a8dx/2340f9527af64f8ef8439366de981168)
- [PMTiles Concepts | Protomaps Docs](https://docs.protomaps.com/pmtiles/)
- [Protomaps — open source single file maps, Antonio Gioia](https://www.antoniogioia.com/protomaps-open-source-single-file-maps)
