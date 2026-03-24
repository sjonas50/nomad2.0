# Research: PMTiles Regional Extraction in Pure Node.js (No Go Binary)

## Executive Summary

Pure Node.js PMTiles extraction is **feasible but requires manual implementation** — there is no turnkey npm package equivalent to `go-pmtiles extract`. The official `pmtiles` npm package (v4.4.0) is read-only with no write capability. One third-party package (`s2-pmtiles`) provides a writer but is niche (1 GitHub star, ~10 contributors) and must be evaluated for stability. The PMTiles v3 binary format is well-specified and writable from scratch in ~200–300 lines of TypeScript, making a custom implementation the most reliable path. The Go binary remains strongly preferred for production; pure Node.js is viable for environments where running a Go binary is truly prohibited.

---

## Problem Statement

The Attic AI runs `pmtiles extract` via a BullMQ subprocess. The question is whether the Go binary can be eliminated and replaced with pure Node.js for environments that cannot run arbitrary binaries, restricted container environments, or bundled Electron-style deployments.

---

## Technology Evaluation

### Option A: `pmtiles` npm package (v4.4.0) — READ-ONLY, no extraction

**Install:** `npm i pmtiles`  
**Repo:** https://github.com/protomaps/PMTiles (js/ subdirectory)  
**Published:** ~January 2026  

**What exists:**
- `PMTiles` class: `getHeader()`, `getMetadata()`, `getZxy(z, x, y)`, `getTileJson(baseUrl)`
- `FetchSource` class: opens a remote HTTP URL, issues HTTP range requests automatically
- `zxyToTileId(z, x, y)` and `tileIdToZxy(id)` — Hilbert curve conversion, exported
- `bytesToHeader()`, `findTile()` — low-level directory parsing utilities, exported
- `Entry` interface: `{ tileId, offset, length, runLength }` — the directory entry structure

**What does NOT exist:**
- No write capability of any kind — confirmed by TypeDoc (zero writer exports)
- No `iterateAllEntries()` or equivalent — the JS lib only resolves individual tile lookups; it does not expose a method to walk the full directory tree
- No `extract()`, `subset()`, or bbox-scoped copy

**How `getZxy` works:**  
`getZxy(z, x, y)` converts coordinates to a Hilbert tileId, then walks the directory hierarchy (up to 4 levels deep using binary search in `findTile()`), issuing HTTP range requests via `FetchSource` only for directory pages and the specific tile data block. It never fetches the full file. Each `getZxy` call = 1–4 HTTP range requests for directory pages + 1 for tile data.

**Can you iterate all tiles?**  
Not via the public API. The Go implementation has `IterateEntries(header, fetchFn, callback)` (added v1.27.0). The JS package has no equivalent. You could reconstruct this by reading raw directory bytes via `source.getBytes(offset, length)` and manually deserializing the varint-encoded directory format — this is ~100 lines of TypeScript.

---

### Option B: `s2-pmtiles` npm package — WRITER EXISTS, evaluate stability

**Install:** `npm i s2-pmtiles`  
**Repo:** https://github.com/Open-S2/s2-pmtiles  
**Maintenance:** 1 GitHub star, <10 contributors, described as "sustainable" by Snyk with recent releases  

**What it provides:**
```typescript
import { S2PMTilesWriter, TileType } from 's2-pmtiles'
import { FileWriter } from 's2-pmtiles/file'

const writer = new S2PMTilesWriter(new FileWriter('output.pmtiles'), TileType.Pbf)
writer.writeTileXYZ(x, y, z, tileDataUint8Array)
await writer.commit() // builds directory, writes header, closes file
```

**Standard PMTiles v3 compatibility:** Yes — the library explicitly claims "backwards compatible" PMTiles V3.0 support. `writeTileXYZ` writes standard web mercator XYZ tiles in Hilbert order.

**The `FileWriter` class** is a Node.js/Bun/Deno implementation for local file writing. The writer buffers tiles and on `commit()` serializes the directory structure, writes the header, and closes the file.

**Risk factors:**
- 1 GitHub star is extremely low signal; this is not a community-validated implementation
- No external audit of whether output files are byte-for-byte compatible with all PMTiles readers
- `s2-pmtiles` also supports an S2-projection extended format — ensure you are using the V3 code path, not S2PMTiles
- No known usage in production systems at scale
- Dependencies unknown without further inspection

**Verdict:** Use only if you have validated output against `pmtiles verify` (Go CLI). Do not use without testing.

---

### Option C: Implement PMTiles v3 writer from scratch — RECOMMENDED for production Node.js path

**Complexity:** Medium. The spec is clear and complete.

**PMTiles v3 binary layout:**
```
[Header: 127 bytes, fixed]
[Root Directory: compressed varint-encoded entries, must fit in first 16,384 bytes total]
[JSON Metadata: gzip-compressed]
[Leaf Directories: optional, for archives > ~16k tiles]
[Tile Data: concatenated tile bytes]
```

**Header (127 bytes):**

| Offset | Size | Field |
|--------|------|-------|
| 0–6 | 7 | Magic: `PMTiles` (UTF-8) |
| 7 | 1 | Version: `0x03` |
| 8–15 | 8 | Root dir offset (LE uint64) |
| 16–23 | 8 | Root dir length (LE uint64) |
| 24–31 | 8 | Metadata offset (LE uint64) |
| 32–39 | 8 | Metadata length (LE uint64) |
| 40–47 | 8 | Leaf dir offset (LE uint64) |
| 48–55 | 8 | Leaf dir length (LE uint64) |
| 56–63 | 8 | Tile data offset (LE uint64) |
| 64–71 | 8 | Tile data length (LE uint64) |
| 72–79 | 8 | Num addressed tiles (LE uint64) |
| 80–87 | 8 | Num tile entries (LE uint64) |
| 88–95 | 8 | Num tile contents (LE uint64) |
| 96 | 1 | Clustered: `0x01` (required for extract to work on output) |
| 97 | 1 | Internal compression: `0x02` (gzip) |
| 98 | 1 | Tile compression: `0x02` (gzip for MVT) |
| 99 | 1 | Tile type: `0x01` (MVT) |
| 100 | 1 | Min zoom |
| 101 | 1 | Max zoom |
| 102–109 | 8 | Min position (lon+lat as LE int32 × 10^7) |
| 110–117 | 8 | Max position |
| 118 | 1 | Center zoom |
| 119–126 | 8 | Center position |

**Directory encoding** uses protobuf-style varints in 5 delta-encoded sections:
1. Entry count (varint)
2. TileIDs (delta varints — store diff from previous, not absolute)
3. RunLengths (varints — 0 = leaf dir pointer, >0 = consecutive tile count)
4. Lengths (varints)
5. Offsets (varints — encode as 0 if offset == prev_offset + prev_length, else as offset+1)

The entire directory is then gzip-compressed and written. For archives with more entries than fit in the root directory limit (16,257 compressed bytes), leaf directories are required — this applies to large region extracts.

**Implementation estimate:** ~250–350 lines of TypeScript. Node.js `zlib.gzip` handles compression. No native deps required. `BigInt` needed for uint64 header fields. The Hilbert curve encode/decode functions are already exported from `pmtiles` npm so you do not need to reimplement them.

---

### Option D: Keep Go binary — STRONGLY RECOMMENDED

**Verdict:** Unless there is a hard constraint preventing binary execution, keep the Go binary. It is:
- Maintained by the PMTiles project authors (same team as the spec)
- Tested against the full planet
- Handles leaf directories, run-length deduplication, clustering, and antimeridian correctly
- 0 lines of custom code to maintain

The existing `research-pmtiles-regional-extract.md` documents the full Go binary workflow.

---

## Bounding Box to Tile Range Conversion

Standard slippy map math for converting a lat/lon bbox to tile x/y range at each zoom:

```typescript
function lon2tile(lon: number, zoom: number): number {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom))
}

function lat2tile(lat: number, zoom: number): number {
  return Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI)
    / 2 * Math.pow(2, zoom)
  )
}

// Returns inclusive tile range for a bbox at a given zoom
function bboxToTileRange(
  west: number, south: number, east: number, north: number, zoom: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: lon2tile(west, zoom),
    maxX: lon2tile(east, zoom),
    minY: lat2tile(north, zoom),  // note: north → smaller y in slippy tiles
    maxY: lat2tile(south, zoom),
  }
}
```

To enumerate all tiles in a bbox across zoom levels:
```typescript
for (let z = minZoom; z <= maxZoom; z++) {
  const range = bboxToTileRange(west, south, east, north, z)
  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      const tileId = zxyToTileId(z, x, y) // from pmtiles npm
      // fetch tile, accumulate
    }
  }
}
```

**Warning:** At z14, a single US state has 50,000–500,000 tiles. This is a large number of sequential `getZxy` HTTP calls. The Go binary batches range requests using spatial locality of the Hilbert curve (clustered archives have nearby tiles at adjacent byte offsets). A naive per-tile HTTP loop in Node.js will be 10–100x slower.

---

## Architecture Pattern: Pure Node.js Extractor

If you must implement this in Node.js, the correct pattern is:

1. Open remote source with `FetchSource` (pmtiles npm)
2. Call `getHeader()` once to read the 127-byte header via one range request
3. Implement `iterateEntries()` by manually reading root + leaf directories via `source.getBytes()` and deserializing the varint format
4. For each entry in the bbox (use `bboxToTileRange` + `zxyToTileId` to build target set), fetch tile data in batches using HTTP range coalescing (sort by Hilbert tileId, merge adjacent byte ranges into single requests — the key optimization the Go binary applies)
5. Write output using either `s2-pmtiles` writer or a custom implementation
6. Sort tiles by tileId before writing (required for clustered output, which is required for future use with `pmtiles extract`)

**HTTP range coalescing is the hard part.** Without it, a US state extract will make hundreds of thousands of round-trips. The Go binary merges nearby tiles into single range requests using the `--overfetch` parameter. You need to implement the same logic: sort tiles by offset, then merge requests where gap < threshold.

---

## Known Pitfalls

1. **No `iterateEntries` in JS** — the pmtiles npm package does not expose directory walking. You must deserialize varint-encoded directories manually or pay per-tile HTTP overhead.
2. **Leaf directories** — large archives (most planet extracts) use multi-level directories. Any custom reader/writer must handle the recursive leaf structure, not just the root directory.
3. **s2-pmtiles writer is unvalidated at scale** — run `pmtiles verify output.pmtiles` against any file produced with it before shipping.
4. **uint64 in JavaScript** — header fields use 64-bit unsigned integers. Use `DataView.setBigUint64()` / `getBigUint64()`. Do not use regular `Number` (max safe integer is 2^53).
5. **Clustered output requirement** — if your output will ever be used as a source for further `pmtiles extract` operations, the file must be clustered (tiles in Hilbert order). This requires sorting all tiles by tileId before writing — you cannot stream them out of order.
6. **Run-length deduplication** — the Go binary deduplicates identical tile content (ocean tiles, empty tiles) using run-length entries. A custom writer that skips this will produce larger files.

---

## Recommended Stack

```
Primary path:     go-pmtiles binary (see research-pmtiles-regional-extract.md)
Fallback path:    Custom Node.js extractor using:
  - pmtiles npm (FetchSource + zxyToTileId for reading)
  - Custom varint directory deserializer (~80 lines)
  - HTTP range coalescing (sort by offset, merge gaps < 64KB)
  - s2-pmtiles writer OR custom writer (validate with pmtiles verify)
  - bboxToTileRange math (above, no library needed)
Avoid:            Per-tile getZxy loop without range coalescing
```

**If shipping a Node.js writer**, implement the binary format directly rather than depending on `s2-pmtiles`. The spec is fully documented and the implementation is ~250 LOC with no native dependencies. This is safer than relying on an unmaintained third-party package.

---

## Open Questions

1. **s2-pmtiles writer correctness** — Has it been validated against `pmtiles verify` and against the full planet extract workflow? Unknown. Needs a test.
2. **Range coalescing threshold** — What gap size between tile byte offsets should trigger a merged request? The Go binary uses `--overfetch=0.10` (10%) as default. Needs benchmarking for HTTPS sources.
3. **Leaf directory threshold** — How many tiles before root directory overflows 16,257 compressed bytes? Approximately 16,000–21,000 entries depending on compression ratio. A custom writer must handle this.
4. **Is the binary truly blocked?** — Confirm the constraint. If Docker is available, the Go binary runs in a container trivially. The pure Node.js path has real complexity cost.

---

## Sources

- [PMTiles v3 Spec](https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md)
- [pmtiles TypeDoc (v4.4.0 exports)](https://pmtiles.io/typedoc/index.html)
- [protomaps/PMTiles GitHub — js/src/index.ts](https://github.com/protomaps/PMTiles/blob/main/js/src/index.ts)
- [go-pmtiles IterateEntries — Go pkg docs](https://pkg.go.dev/github.com/protomaps/go-pmtiles/pmtiles)
- [Open-S2/s2-pmtiles GitHub](https://github.com/Open-S2/s2-pmtiles)
- [s2-pmtiles Snyk health](https://snyk.io/advisor/npm-package/s2-pmtiles)
- [PMTiles v3 Hilbert Tile IDs — Protomaps Blog](https://protomaps.com/blog/pmtiles-v3-hilbert-tile-ids/)
- [Hilbert tile ID primitives reference implementations — Issue #393](https://github.com/protomaps/PMTiles/issues/393)
- [Slippy map tilenames — OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)
- [pmtiles npm package](https://www.npmjs.com/package/pmtiles)
