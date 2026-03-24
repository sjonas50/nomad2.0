# Research: Offline Maps and TAK Integration for Node.js + React ICS Platform

## Executive Summary

For a disaster response web app on a MacBook, **PMTiles + MapLibre GL JS** is the strongest offline map stack: single-file tile archives served locally via Node.js with a range-request handler, rendered client-side by MapLibre. The TAK ecosystem has first-class JavaScript libraries (`@tak-ps/node-cot`, `@tak-ps/node-tak`) maintained by Colorado's public safety tech office (DFPC-COE), making CoT integration achievable without a full TAK server. iTAK is iOS-only; there is no macOS native client, but WebTAK and CloudTAK fill the browser gap. Leaflet with offline caching plugins is a simpler but lower-fidelity alternative for teams that don't need vector rendering.

---

## Problem Statement

A Node.js + React ICS platform running on a MacBook must display maps with full pan/zoom when no internet is available (field deployment, degraded comms). Optionally, it should interoperate with the TAK ecosystem (ATAK, iTAK) used by first responders — sharing position tracks, incident markers, and CoT event data in real time.

---

## Technology Evaluation

### Option A: PMTiles + MapLibre GL JS — RECOMMENDED

**What it is:** PMTiles is a single-file archive (cloud-optimized, HTTP range-request native) containing a pyramid of vector or raster tiles. MapLibre GL JS renders those tiles entirely in WebGL.

**How offline works:**
1. Download a Protomaps daily build (`planet.pmtiles`, ~107 GB) and extract a regional subset using the `pmtiles` CLI Go binary: `pmtiles extract planet.pmtiles california.pmtiles --bbox=-124.48,32.53,-114.13,42.01`
2. Serve the `.pmtiles` file from your Express/Node.js backend via a range-request handler (or static middleware with `Accept-Ranges` support).
3. In React, register the `pmtiles://` protocol with `maplibre-gl` using the `pmtiles` npm package (one `useEffect` at root).
4. For full offline (no tile server), a Service Worker can intercept HTTP range requests against the locally cached `.pmtiles` file.

**Key packages:**
- `maplibre-gl` v4.x (Apache 2.0)
- `pmtiles` v3.x — `npm install pmtiles`
- `protomaps-themes-base` — default OSM cartography styles
- `react-map-gl` v7.x — React wrapper (optional but convenient)

**Storage estimates (vector tiles, OSM data, z0–z14):**
- Small US state (Oregon): ~1–3 GB
- Large US state (California): ~4–8 GB
- New York PBF → MBTiles: 265 MB PBF produces ~490 MB MBTiles (vector)
- World planet PMTiles: 107 GB (you extract a subset)

**Generating tiles from scratch (alternative to Protomaps builds):**
- `tilemaker` (C++ binary) converts a Geofabrik `.osm.pbf` extract directly to `.mbtiles` or `.pmtiles` without a Postgres stack.
- Geofabrik provides free US state `.osm.pbf` extracts at download.geofabrik.de.

**Pros:** No tile server process needed; one file to distribute; Service Worker path works fully air-gapped; MapLibre is actively maintained (Apache 2.0, not BSL); excellent React ecosystem.

**Cons:** Requires Go binary (`pmtiles` CLI) for extract generation; Service Worker setup adds complexity; `.pmtiles` file must be seeded before going offline.

---

### Option B: MBTiles + TileServer GL Light — CONSIDER

**What it is:** MBTiles is a SQLite database containing tiles (raster PNG/JPEG or vector PBF). `tileserver-gl-light` is a pure-JS Node.js tile server that reads MBTiles and exposes a standard `{z}/{x}/{y}` tile endpoint.

**How offline works:**
1. Obtain an MBTiles file (Geofabrik tile packages, BBBike extract, or generate with `tilemaker`).
2. Embed `tileserver-gl-light` directly in your Express app or run it as a sidecar process on a different port.
3. Point MapLibre GL JS or Leaflet at `http://localhost:8080/tiles/{tileset}/{z}/{x}/{y}.pbf`.

**Key packages:**
- `tileserver-gl-light` — npm, Node 20+ required, Node 24 recommended; pure JS, no native deps
- `tileserver-gl` — full version, adds server-side raster rendering but requires native bindings (harder on macOS ARM)

**Pros:** MBTiles is a widely supported format; TileServer GL Light is pure JS, easy to embed; WMTS endpoint for GIS tool compatibility; works with both raster and vector tiles.

**Cons:** Requires a running tile server process (even if embedded); MBTiles is not as portable as PMTiles (SQLite file I/O vs. range requests); `tileserver-gl` (full) has native dependency pain on macOS Apple Silicon.

---

### Option C: Leaflet + PouchDB/IndexedDB Tile Cache — AVOID FOR THIS USE CASE

**What it is:** Leaflet loads tiles from a remote tile server; plugins like `leaflet.tilelayer.pouchdbcached` or `leaflet-cachestorage` cache them locally in IndexedDB or CacheStorage as tiles are viewed.

**Why it's insufficient here:**
- Requires an internet connection to populate the cache initially — you can't guarantee coverage before going offline.
- `leaflet.tilelayer.pouchdbcached` (v1.0.0) was last published 6 years ago; the ecosystem is stagnant.
- No vector tile support — raster only.
- Cache coverage is hit-or-miss unless user has manually panned every area.

**When to use it:** As a supplemental layer on top of a PMTiles baseline, caching satellite imagery tiles that have been fetched while online.

---

### Option D: Pre-rendered z/x/y PNG Tile Pyramid (Static Folder) — AVOID

Serving static PNG tiles from the filesystem is the simplest possible approach but produces directories with millions of files (a single US state at z14 = tens of millions of PNGs). Storage is 5–10x larger than equivalent vector tiles, and distribution/update is impractical.

---

## Architecture Patterns Found

**Pattern 1: PMTiles served via Express range requests**
- Add `express-serve-static-core` or a thin custom middleware that handles `Range` headers against a `.pmtiles` file on disk.
- MapLibre uses the `pmtiles://` protocol handler to make byte-range fetches against `http://localhost:3000/tiles/region.pmtiles`.
- No separate tile server process. Cleanest for a self-contained Electron-style or local web app.

**Pattern 2: Service Worker + PMTiles (fully air-gapped)**
- On first load (while online), SW fetches and caches the `.pmtiles` file in CacheStorage.
- On subsequent loads (offline), SW intercepts `Range` requests and slices bytes from the cached file.
- Reference implementation: [thomasgauvin's Cloudflare Pages + Protomaps](https://thomasgauvin.com/writing/static-protomaps-on-cloudflare/) demonstrates the pattern; adapt for local use.

**Pattern 3: TileServer GL Light as embedded Express middleware**
- Mount `tileserver-gl-light` on a sub-route of your main Express app.
- Best if you already have MBTiles files or need WMTS output for external GIS tools.

**Reference implementations:**
- [dfpc-coe/CloudTAK](https://github.com/dfpc-coe/CloudTAK) — open-source browser TAK client built on Vue/Node/TypeScript; study its CoT integration patterns.
- [Simon Willison's PMTiles TIL](https://til.simonwillison.net/gis/pmtiles) — concise MapLibre + PMTiles integration walkthrough.
- [maplibre/maplibre-gl-js Discussion #1580](https://github.com/maplibre/maplibre-gl-js/discussions/1580) — community thread on offline MBTiles patterns.

---

## Key APIs and Services

### Tile Data Sources

| Source | Format | Cost | Notes |
|--------|--------|------|-------|
| [Protomaps daily builds](https://maps.protomaps.com/builds/) | PMTiles | Free | Full planet; use `pmtiles extract` to cut a region |
| [Geofabrik downloads](https://download.geofabrik.de/north-america/us/) | OSM PBF | Free | Per-state PBF; convert with `tilemaker` |
| [MapTiler Data](https://data.maptiler.com/downloads/tileset/osm/) | MBTiles | Paid | Pre-built, polished; pricing by region |
| [BBBike extract service](https://extract.bbbike.org/) | MBTiles/PBF | Free | Draw bounding box, email download link |
| [Geofabrik tile packages](https://www.geofabrik.de/maps/tile-packages.html) | MBTiles | Paid | Pre-rendered raster tiles for specific regions |

### Tile Generation Tools

- **`tilemaker`** (C++ binary, GitHub: systemed/tilemaker) — OSM PBF → MBTiles/PMTiles. No Postgres needed. Recommended for custom extracts.
- **`pmtiles` CLI** (Go binary, github.com/protomaps/go-pmtiles) — extract/inspect/serve PMTiles. `pmtiles extract --bbox=... --dry-run` to preview size before download.

### TAK / CoT APIs

- **`@tak-ps/node-cot`** (npm, v14.x, updated actively March 2026) — parse/generate CoT XML and Protobuf; bidirectional GeoJSON conversion. Maintained by Colorado DFPC-COE. This is the core library.
- **`@tak-ps/node-tak`** (npm) — TLS client for TAK Server connections; streaming CoT events; TAK Server REST API SDK. Exposes `TAK.connect()` with `'cot'` event emitter.
- **TAK Server REST API** — TAK Server (Java, self-hosted) exposes REST endpoints for missions, data packages, and video. Auth via client certificates or API keys.
- **FreeTAK Server** (Python, open source) — lighter alternative to official TAK Server; Node-RED integration via `node-red-contrib-tak`.
- **OpenTAKServer** (Python, GitHub: brian7704/OpenTAKServer) — another open-source TAK Server; supports CloudTAK integration.

**CoT Transport options from a Node.js app:**
1. TCP/TLS stream to TAK Server (port 8089) — use `@tak-ps/node-tak`
2. UDP multicast to local network (SA broadcast, no server needed) — raw UDP with CoT XML
3. WebSocket to TAK Server (port 8446) — some TAK Server versions support this

---

## Known Pitfalls and Risks

**PMTiles / MapLibre:**
- `maplibre-gl` is a WebGL app; it will not render in headless environments or SSR without a canvas shim. Client-side only.
- HTTP range requests against a local file require `Content-Range` response headers — plain `express.static()` alone is insufficient; verify middleware supports ranges (`res.sendFile` does, `express.static` does with `acceptRanges: true` which is the default).
- PMTiles file must be pre-cached before network loss. There is no incremental sync — it's all-or-nothing per file.
- `react-map-gl` discussion #2165 notes `addProtocol` must be called before Map instantiation; a common React lifecycle bug.

**MBTiles / TileServer GL:**
- `tileserver-gl` (full, with raster rendering) requires native bindings that have historically been painful to compile on macOS Apple Silicon. Use `tileserver-gl-light` and skip server-side rasterization.
- MBTiles is a SQLite file; concurrent reads from multiple Node.js workers require WAL mode or connection pooling (better-sqlite3 handles this).

**TAK / CoT:**
- CoT XML uses millisecond epoch timestamps in a non-standard format (`2024-01-15T12:00:00.000Z` stale time field); `@tak-ps/node-cot` handles this, but manual XML construction gets it wrong.
- TAK Server uses mutual TLS (client certs). Getting cert provisioning right for a non-TAK app is the biggest integration hurdle.
- iTAK is iOS-only — it runs on iPhones/iPads but NOT natively on macOS (no Mac Catalyst support confirmed). Use WebTAK (browser) or CloudTAK for macOS users.
- WebTAK (Draper-developed) requires a running TAK Server connection; it is not a standalone client.

**Data freshness:**
- Geofabrik and Protomaps builds lag OSM by ~1–7 days. For disaster response, road network changes in a declared disaster area may not be reflected. Consider supplementing with live data overlays (GeoJSON from your own backend) for actively changing features.

---

## Recommended Stack

**Offline Maps:**
```
PMTiles (regional extract, ~2–8 GB per US state)
  + tilemaker (to generate from Geofabrik OSM PBF)
  + pmtiles CLI (to extract bounding box from planet build)
  + maplibre-gl v4 + pmtiles npm package (client rendering)
  + Express range-request middleware (serve .pmtiles locally)
  + protomaps-themes-base (OSM cartography styles)
```

**TAK Interoperability:**
```
@tak-ps/node-cot v14.x  (CoT XML/Protobuf parse + generate)
@tak-ps/node-tak        (TAK Server TLS streaming client)
```
For a standalone mode without a TAK Server, use `@tak-ps/node-cot` to produce UDP CoT broadcasts on the local network — ATAK/iTAK devices on the same subnet will receive them.

**Reference Architecture for CloudTAK-style functionality:**
Study [dfpc-coe/CloudTAK](https://github.com/dfpc-coe/CloudTAK) — it is a production browser-based TAK client built by a public safety org. It does exactly what this ICS platform aspires to (browser COP + TAK server integration). It uses Vue, but the CoT integration patterns are portable.

---

## Open Questions

1. **Storage budget**: How large of a region needs to be covered? A single US state at z0–z14 fits in 2–8 GB. Multi-state or national coverage at high zoom is 50+ GB.
2. **TAK Server availability**: Is there an existing TAK Server (government-run COTAK, FreeTAK, or OpenTAKServer) to connect to, or does this app need to act as one?
3. **Satellite imagery offline**: Vector OSM tiles have no satellite layer. If aerial imagery is needed, a separate raster MBTiles package (from MapTiler or USGS imagery) must be included — these are 10x larger than vector tiles.
4. **macOS deployment model**: Is this a browser tab, an Electron app, or a local server accessed via localhost? Service Worker caching requires HTTPS or localhost; Electron has different constraints.
5. **CoT over UDP vs. TLS**: UDP multicast works on a LAN without a server but does not traverse networks. If field units are on cellular/satellite links, a TAK Server (or relay) is required.
6. **Search/geocoding offline**: MapLibre with PMTiles has no offline geocoder. Options: bundle Nominatim data locally (large), pre-index known locations (practical for ICS use cases), or accept no search when offline.

---

## Sources

- [Protomaps PMTiles Concepts](https://docs.protomaps.com/pmtiles/)
- [PMTiles CLI Reference](https://docs.protomaps.com/pmtiles/cli)
- [PMTiles for MapLibre GL](https://docs.protomaps.com/pmtiles/maplibre)
- [Protomaps Getting Started](https://docs.protomaps.com/guide/getting-started)
- [protomaps/PMTiles GitHub](https://github.com/protomaps/PMTiles)
- [maptiler/tileserver-gl GitHub](https://github.com/maptiler/tileserver-gl)
- [tileserver-gl npm](https://www.npmjs.com/package/tileserver-gl)
- [tileserver-gl-light npm](https://www.npmjs.com/package/tileserver-gl-light)
- [MapLibre GL JS Offline MBTiles Discussion](https://github.com/maplibre/maplibre-gl-js/discussions/1580)
- [dfpc-coe/CloudTAK GitHub](https://github.com/dfpc-coe/CloudTAK)
- [dfpc-coe/node-CoT GitHub](https://github.com/dfpc-coe/node-CoT)
- [dfpc-coe/node-tak GitHub](https://github.com/dfpc-coe/node-tak)
- [TAK.gov Products](https://tak.gov/products)
- [iTAK App Store](https://apps.apple.com/us/app/itak/id1561656396)
- [COTAK iTAK Offline Maps Tutorial](https://cotak.gov/pages/itak-training/itak-offline-maps-tutorial)
- [Draper WebTAK News Release](https://www.draper.com/media-center/news-releases/detail/23423/u-s-inaugurations-military-units-used-draper-developed-webtak-for-communications-situational-awareness)
- [TAK Ecosystem - Hackaday](https://hackaday.com/2022/09/08/the-tak-ecosystem-military-coordination-goes-open-source/)
- [Meshtastic + TAK Server Integration](https://meshtastic.org/blog/tak-server-integration-ios/)
- [Geofabrik US State Downloads](https://download.geofabrik.de/north-america/us/)
- [Geofabrik Tile Packages](https://www.geofabrik.de/maps/tile-packages.html)
- [tilemaker GitHub](https://github.com/systemed/tilemaker)
- [Simon Willison: PMTiles + MapLibre TIL](https://til.simonwillison.net/gis/pmtiles)
- [Offline Maps with Protomaps in MapLibre (blog)](https://blog.wxm.be/2024/01/14/offline-map-with-protomaps-maplibre.html)
- [MapLibre GL JS Combining Offline/Online Discussion](https://github.com/maplibre/maplibre-gl-js/discussions/1389)
- [leaflet.offline npm](https://www.npmjs.com/package/leaflet.offline)
- [react-map-gl PMTiles Discussion](https://github.com/visgl/react-map-gl/discussions/2165)
- [OpenTAKServer GitHub](https://github.com/brian7704/OpenTAKServer)
- [FreeTAKTeam/FreeTAKHub GitHub](https://github.com/FreeTAKTeam/FreeTAKHub)
- [node-red-contrib-tak](https://flows.nodered.org/node/node-red-contrib-tak)
- [ATAK Maps GitHub](https://github.com/joshuafuller/ATAK-Maps)
- [Building Vector Tiles from OpenStreetMap](https://ckochis.com/vector-tiles-from-osm)
