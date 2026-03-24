# Research: The Attic AI — COOP Features & Capabilities

## Executive Summary

The Attic AI's existing stack (AdonisJS + Ollama + Qdrant + FalkorDB + Meshtastic) is a strong foundation for a serious continuity-of-operations platform. The five highest-impact additions are: (1) Yjs-based CRDT sync for multi-node data replication without a central coordinator, (2) whisper.cpp offline voice capture feeding structured after-action reports, (3) Valhalla self-hosted routing + Meshtastic GPS overlay for offline situational awareness, (4) a native ICS/COOP data model (Incident, Resource, Task, PersonnelStatus) exposed as structured RAG context, and (5) OpenTAKServer integration to bridge into the established TAK ecosystem. None of these require abandoning the current stack.

---

## Problem Statement

An offline COOP platform is only useful during a crisis if it: (a) works when the network is gone, (b) merges data correctly when multiple isolated nodes reconnect, (c) captures decisions and status in structured formats the AI can reason over, and (d) provides geospatial awareness without cloud services. The current Attic AI handles (a) well but has no answer for (b), (c), or (d).

---

## 1. Data Resilience & Sync

### The Core Problem

Multiple Attic nodes operating in disconnected "islands" will diverge. When they reconnect (via Meshtastic, WiFi bridge, or sneakernet USB), merging their state requires a conflict resolution strategy. Last-write-wins is dangerous in crisis contexts (a deleted resource record could be catastrophic).

### Option A: Yjs — Recommended

- **Version**: 13.6.23 (npm: `yjs`)
- **What it is**: Operation-based CRDT. Every mutation is an operation stored in a log. Nodes exchange ops and converge deterministically.
- **Node.js support**: First-class. `y-leveldb` for persistence, `y-websocket` for real-time, custom transport for Meshtastic relay.
- **Why it wins**: 2.5M weekly downloads, battle-tested in production (used by VS Code Live Share, Notion alternatives). The binary encoding is compact — fits in Meshtastic packet payloads with fragmentation.
- **Gotcha**: Yjs is text/document-oriented. For structured records (incident logs, resource tables), you use `Y.Map` and `Y.Array` — ergonomic but not a relational DB replacement.
- **Effort**: M | **Impact**: 5/5

### Option B: Automerge 2.x — Consider

- **Version**: `@automerge/automerge` 2.2.x
- **Rust core compiled to WASM**; JSON-native data model is more intuitive for structured records than Yjs.
- **Slower than Yjs** on large documents (benchmarks show 5-10x gap). 5K weekly downloads vs Yjs's 2.5M — smaller community.
- **Better fit** if your primary use case is structured JSON documents (incident reports) rather than rich text.
- **Effort**: M | **Impact**: 4/5

### Option C: Loro — Avoid for Now

- **Version**: `loro-crdt` 1.x (npm). Rust/WASM, supports rich text + movable tree.
- **API and encoding schema marked experimental.** They explicitly warn against production use.
- Revisit in 12 months.

### Option D: PowerSync — Avoid

- Requires a hosted sync server (PowerSync Cloud or self-hosted). The self-hosted path adds PostgreSQL as a required dependency and assumes persistent connectivity for initial setup. Not appropriate for fully air-gapped deployment.

### Recommended Sync Architecture

```
Node A (Yjs doc) ←—Y.js ops over WebSocket—→ Node B (Yjs doc)
                    ↑
         Meshtastic relay (fragmented Yjs update packets)
                    ↑
         y-leveldb persistence on each node (survives reboot)
```

Snapshot shipping: Export full Yjs state vector every N minutes to a `.yjs` binary snapshot stored alongside ZIM files. Sneakernet sync = copy the snapshot file.

Merkle tree approach (alternative for large datasets): Use the `hash-wasm` library to build a Merkle tree over document IDs + version vectors. Nodes exchange root hashes first; only fetch subtrees that differ. Reduces sync bandwidth significantly for large knowledge bases.

---

## 2. Knowledge Capture & Preservation

### Voice-to-Text: whisper.cpp — Recommended

- whisper.cpp runs on Raspberry Pi 5 at 3-5x real-time on the `base.en` model (1.8GB RAM peak).
- Node.js integration: Use `whisper-node` (npm, wrapper around whisper.cpp binary) or call the binary directly via `child_process`. The npm package `@leiferiksonventures/whisper.cpp` is stale (v0.0.5, 3 years old) — use the binary wrapper approach.
- **Workflow**: Record audio → whisper.cpp transcription → LLM structured extraction → Pydantic-style JSON schema → save to FalkorDB as a versioned knowledge node.
- **Effort**: S | **Impact**: 4/5

### Structured Knowledge Formats

| Format | Use Case | Recommendation |
|--------|----------|----------------|
| After-Action Report (AAR) | Post-incident review | ICS-214 schema, store in FalkorDB |
| Standard Operating Procedure | Pre-defined workflows | Versioned Markdown + semantic chunking into Qdrant |
| Decision Log | Real-time crisis decisions | Append-only log, Yjs `Y.Array`, synced across nodes |
| Personnel Status | Who is where, doing what | ICS-211 schema, real-time Yjs map |

### Versioned Knowledge Base

- Use FalkorDB's graph structure to model document lineage: `(DocumentV1)-[:SUPERSEDED_BY]->(DocumentV2)`.
- Every edit creates a new node; the graph preserves full history.
- Integrate with `diff` at the text level (use `diff-match-patch` npm package) to show what changed between versions.
- **Effort**: M | **Impact**: 4/5

---

## 3. Mesh Intelligence

### Current State

Meshtastic is LoRa-based, ~250 byte usable payload per packet, ~10 second transmission time. It is not a high-bandwidth AI inference network.

### Realistic Patterns (Avoid Hype)

**Pattern 1: Query Routing (Recommended)**
A mesh node receives a text query → routes it to the nearest Attic node with sufficient model loaded → returns the response. Implementation: listen on Meshtastic channel with a prefix (`!ask ...`), POST to local Ollama, send response back in fragments.

The `mesh-api` project (GitHub: `mr-tbot/mesh-api`) already implements this pattern — Ollama + Meshtastic in ~300 lines of Python. Port or call as sidecar.

- **Effort**: S | **Impact**: 3/5

**Pattern 2: Knowledge Sync via Mesh**
Instead of syncing full Yjs ops over mesh (too large), sync only: (a) delta hashes (which documents changed), (b) brief summaries of new entries (truncated to 200 chars). Full sync happens when WiFi is available.

- **Effort**: M | **Impact**: 4/5

**Pattern 3: Federated Inference (Avoid for Now)**
Splitting LLM inference across mesh nodes requires synchronous coordination and low latency. LoRa cannot provide this. MoE-style distributed inference over WiFi mesh is theoretically possible but requires petabyte-bandwidth networks. Defer indefinitely.

### OpenTAKServer Integration — High Value

OpenTAKServer v1.7.0 has **native Meshtastic bridging** built in. It translates Meshtastic node positions into TAK PLI (Position Location Information) objects and publishes them to connected ATAK/iTAK clients.

- TAK Cursor-on-Target (CoT) XML is a well-defined standard for situational awareness events.
- Running OpenTAKServer alongside Attic AI enables: Meshtastic GPS tracks on a TAK map, GeoChat bridging, and event feeds the Attic AI can ingest.
- OpenTAKServer is Python/Flask, runs in Docker, ARM64-compatible.
- **Effort**: M | **Impact**: 5/5

---

## 4. Operational Templates & Playbooks

### Core COOP Data Model

The ICS (Incident Command System) is the US federal standard for emergency operations. Model it directly:

```typescript
// Incident — top-level container
interface Incident {
  id: string
  name: string
  type: 'natural_disaster' | 'infrastructure_failure' | 'security' | 'medical' | 'other'
  status: 'declared' | 'active' | 'contained' | 'closed'
  iap_period: number          // Operational Period number
  declared_at: DateTime
  incident_commander: PersonnelRef
  essential_functions: EssentialFunction[]
}

// Essential Function — what must keep running
interface EssentialFunction {
  id: string
  name: string
  priority: 1 | 2 | 3        // FEMA tiers
  primary_personnel: PersonnelRef[]
  alternate_personnel: PersonnelRef[]
  procedures: PlaybookRef[]
  status: 'nominal' | 'degraded' | 'failed'
}

// Resource — equipment, vehicles, supplies
interface Resource {
  id: string
  type: string
  quantity: number
  location: GeoPoint
  assigned_to: IncidentRef | null
  status: 'available' | 'assigned' | 'out_of_service'
}

// ICS-214 Activity Log entry
interface ActivityLog {
  id: string
  incident_id: string
  timestamp: DateTime
  actor: PersonnelRef
  activity: string            // Free text or structured
  source: 'manual' | 'voice' | 'ai_extracted'
}
```

### AI Playbook Integration

- Store playbooks as versioned Markdown in Qdrant (semantic search).
- At incident declaration, the AI auto-surfaces the 3 most relevant playbooks based on incident type.
- FalkorDB models the dependency graph between essential functions: if Function A fails, what other functions are at risk?
- **Effort**: M | **Impact**: 5/5

### Recommended Pre-Built Templates

1. **Emergency Communications** — Primary/alternate/contingency/emergency (PACE) contacts, radio frequencies, Meshtastic channel assignments.
2. **Personnel Accountability Report (PAR)** — ICS-211 check-in form, synced via Yjs across all nodes.
3. **Resource Request (ICS-213RR)** — Structured form, AI extracts from voice description.
4. **After-Action Report (AAR/ICS-214)** — Auto-populated from activity logs + AI narrative synthesis.
- **Effort**: S per template | **Impact**: 4/5

---

## 5. Hardware Hardening

### Power Management

| Solution | Cost | Notes |
|----------|------|-------|
| Sixfab UPS HAT | ~$80 | I2C power monitoring, graceful shutdown trigger, Raspberry Pi native |
| PV PI HAT (crowdfunding) | ~$60 | True MPPT solar charging, BQ25756 controller, LiFePO4 support, watchdog restart |
| Strato Pi (Sfera Labs) | ~$200+ | Industrial-grade, CE/RoHS certified, built-in RTC + UPS, suitable for permanent install |
| Generic 18650 UPS module | ~$20 | No monitoring capability, no graceful shutdown — avoid |

**Recommended**: Sixfab UPS HAT for mobile/field, Strato Pi for fixed installations. Both expose power state over I2C — implement a systemd service that monitors battery level and triggers graceful Docker Compose stop before hard shutdown.

### Boot Resilience

- Use `overlayroot` (Ubuntu/Debian) to mount the root filesystem read-only with a RAM overlay. All writes go to RAM; the SD card is protected from corruption on hard power loss.
- Persistent data (Qdrant, FalkorDB, uploads) lives on a separate USB SSD mounted at `/data`. Label it `ATTIC-DATA` and reference by LABEL in `/etc/fstab` so it survives device path changes.
- Watchdog: enable the Pi's hardware watchdog (`bcm2835_wdt`) and configure it in `systemd` — if the system hangs, it reboots automatically.
- **Effort**: S | **Impact**: 4/5

### Ruggedized Enclosure Options

- **Argon ONE M.2**: Passive cooling, M.2 SSD slot, aluminum — suitable for fixed installs.
- **DFRobot Romeo/LoRa cases**: Designed for field deployment with LoRa radios.
- **Pelican 1510 + custom foam**: For mobile kit.

### Docker Compose for Low-Resource Hardware

Current concern: Ollama + Qdrant + FalkorDB + AdonisJS all running simultaneously on a Pi 4 (4GB RAM) is tight. Measured baseline:
- Ollama idle: ~200MB RAM, spikes to 2-4GB during inference (model-dependent)
- Qdrant: ~100MB idle
- FalkorDB: ~80MB idle
- AdonisJS: ~120MB

**Recommendation**: Add `mem_limit` constraints to `docker-compose.yml`. Use `llama3.2:1b` (quantized, ~800MB) as the default model on Pi 4, `mistral:7b-instruct-q4` on mini-PC.

---

## 6. Offline Map & Geospatial

### Routing: Valhalla — Recommended

- **Docker image**: `ghcr.io/valhalla/valhalla` — ARM64 support has been in progress (issue #3424); check current status before deploying on Pi.
- **Alternative if ARM64 still problematic**: `graphhopper` (Java-based, proven ARM64 support).
- **Data**: Download regional `.osm.pbf` extract from Geofabrik; Valhalla builds tiles from it. A typical US state extract is 500MB-2GB.
- Valhalla supports: turn-by-turn, isochrone (travel time contours — useful for "what's reachable in 30 min?"), matrix (multi-origin/destination), map matching (snap GPS tracks to roads).
- **Effort**: M | **Impact**: 4/5

### Asset Tracking on Mesh

- Meshtastic nodes broadcast GPS positions over the `MAP_REPORT` packet type.
- Parse these in the Attic AI backend (Meshtastic Python sidecar) → push to a `positions` table → serve via WebSocket to a MapLibre GL JS frontend.
- PMTiles + MapLibre (already in stack) + live position overlay = full offline situational awareness map.
- Store position history in FalkorDB: `(Node)-[:AT {timestamp}]->(GeoPoint)` — enables track replay.
- **Effort**: M | **Impact**: 5/5

### Geofencing

- Use `@turf/turf` (npm) for client-side geofence checks — no server round-trip needed.
- Define zones (safe area, hazard zone, rally point) as GeoJSON polygons stored in the knowledge base.
- Alert when a tracked asset enters or exits a zone.
- **Effort**: S | **Impact**: 3/5

### PMTiles Enhancement

PMTiles is already in the stack. Add:
- `protomaps-leaflet` or `maplibre-gl` for rendering (MapLibre preferred — more active).
- Offline geocoding: `Nominatim` self-hosted (requires PostGIS) OR `pelias/placeholder` (SQLite-based, 300MB, no PostGIS needed — recommended for Pi).
- **Effort**: S (Pelias Placeholder) | **Impact**: 3/5

---

## 7. Prior Art & Lessons Learned

### ATAK / TAK Ecosystem

- **What it is**: Android Team Awareness Kit — military/first responder situational awareness, open-sourced in 2020. Used by FEMA, state emergency management, military.
- **Relevant**: CoT (Cursor-on-Target) XML standard for position/event sharing, plugin architecture, proven mesh+TAK integration via OpenTAKServer.
- **Lesson**: CoT XML is verbose but extremely well-documented. The Attic AI should be able to produce/consume CoT events — this enables interoperability with existing field teams using ATAK.
- **TAK-ML**: An ML inference plugin for ATAK exists (object detection on imagery). Pattern to borrow: inference results as CoT events on the network.

### FreeTAK Server

- Python-based TAK server with Meshtastic bridge.
- More complex than OpenTAKServer, heavier resource footprint.
- **Lesson**: Both FreeTAK and OpenTAK demonstrate that the bridge between LoRa mesh and situational awareness tooling is solved — build on their shoulders, don't reinvent.

### Kiwix / Zimfarm

- Already in the Attic AI stack. Key insight: Kiwix's `libzim` exposes a C++ API with Python bindings. The existing Python sidecar can generate custom ZIM files from the Attic AI's own knowledge base — creating a portable, compressed snapshot that can be loaded on any Kiwix-compatible reader.
- This is the "sneakernet knowledge export" feature: burn a ZIM to USB, hand it to someone in the field.
- **Effort**: M | **Impact**: 4/5

### Civilian Mesh + AI Projects

- **AREDN (Amateur Radio Emergency Data Network)**: High-bandwidth WiFi mesh for emergency comms. Not LoRa, but AREDN nodes can backhaul between Meshtastic clusters.
- **KA9Q-radio**: SDR-based software-defined radio stack for AREDN-style networking.
- **Gotenna Mesh** (commercial, now discontinued): Proof that mesh + structured messaging has a civilian market.
- **Briar** (open source, Android): Offline P2P messaging via Bluetooth/WiFi/Tor. Its gossip protocol for message propagation is directly applicable to Attic AI knowledge sync.

---

## Recommended Implementation Roadmap

| Priority | Feature | Effort | Impact | Notes |
|----------|---------|--------|--------|-------|
| 1 | ICS data model + COOP playbook templates | S | 5/5 | Pure backend schema + seed data, no new deps |
| 2 | Whisper.cpp voice capture → structured AAR | S | 4/5 | whisper.cpp binary + child_process wrapper |
| 3 | Meshtastic GPS → MapLibre live overlay | M | 5/5 | Needs Meshtastic Python sidecar polling |
| 4 | Yjs CRDT sync between Attic nodes | M | 5/5 | `yjs` + `y-leveldb` + custom transport |
| 5 | OpenTAKServer integration | M | 5/5 | Docker Compose addition, CoT event bridge |
| 6 | Valhalla offline routing | M | 4/5 | Verify ARM64 image first |
| 7 | Versioned knowledge base (FalkorDB lineage) | M | 4/5 | Graph schema extension |
| 8 | overlayroot + watchdog + UPS monitoring | S | 4/5 | System-level, doesn't touch app code |
| 9 | Custom ZIM export of knowledge base | M | 4/5 | Python sidecar extension |
| 10 | Pelias Placeholder offline geocoding | S | 3/5 | SQLite, 300MB, Docker |
| 11 | Geofencing with Turf.js | S | 3/5 | Frontend-only |
| 12 | Mesh knowledge delta sync (hash tree) | L | 4/5 | Custom protocol, complex |

---

## Key APIs and Services (All Offline-Capable)

| Service | Library/Binary | Version | Notes |
|---------|---------------|---------|-------|
| CRDT sync | `yjs` | 13.6.23 | `y-leveldb` for persistence |
| CRDT persistence | `y-leveldb` | 7.0.0 | LevelDB backend for Yjs |
| Voice transcription | `whisper.cpp` | latest binary | Pi 5: `base.en` model, ~1.8GB RAM |
| Offline routing | Valhalla Docker | 3.x | Verify ARM64 support |
| Geocoding | Pelias Placeholder | latest | SQLite, 300MB |
| Map rendering | `maplibre-gl` | 4.x | PMTiles-native |
| Geofencing | `@turf/turf` | 7.x | Client-side, zero server load |
| TAK server | OpenTAKServer | 1.7.0 | Python/Flask, Docker |
| CoT parsing | `tak-server` npm or custom | — | CoT XML is simple enough to hand-parse |
| Text diff | `diff-match-patch` | 1.0.5 | Document versioning |

---

## Known Pitfalls and Risks

1. **Yjs history bloat**: Yjs never garbage-collects operations by default. A long-running crisis node will accumulate unbounded operation history. Set `ydoc.gc = true` and implement periodic snapshot+reset cycles.

2. **Meshtastic bandwidth**: 250-byte payload, ~10 second air time per packet. Any sync protocol over Meshtastic must aggressively compress and fragment. Do not attempt to sync Qdrant embeddings over mesh — only sync text summaries and metadata.

3. **Valhalla ARM64**: The ARM64 Docker image build has been an open issue. Test this before committing to Valhalla. Have graphhopper as fallback.

4. **whisper.cpp on Pi 4 (not Pi 5)**: Pi 4 is noticeably slower — `tiny.en` model may be the practical ceiling for real-time transcription. Pi 5 handles `base.en` comfortably.

5. **Concurrent Ollama inference**: Ollama serves one request at a time on CPU. During a crisis, multiple users hitting the AI simultaneously will queue. Set explicit queue depth limits and surface queue position to users in the UI.

6. **FalkorDB memory**: FalkorDB (RedisGraph fork) loads the entire graph into RAM. A large incident with thousands of log entries and position records will grow unboundedly. Implement graph pruning: archive resolved incidents to JSON snapshots, delete from active graph.

7. **CoT XML interop**: ATAK plugins frequently use proprietary CoT extensions. The standard CoT types (PLI, GeoChat, sensor events) are well-documented; custom plugin events are not. Implement only standard CoT types.

8. **overlayroot + Docker**: overlayroot and Docker's overlay filesystem driver conflict on some kernels. Test explicitly on target hardware before deploying. Alternative: use `tmpfs` for Docker's layer cache only, keep data volumes on the USB SSD.

---

## Open Questions

1. Does the existing Meshtastic integration use the Python library or the HTTP API? This determines whether adding a Python sidecar is additive or redundant.
2. Is FalkorDB expected to persist across reboots? The `redis.conf` `appendonly yes` setting must be verified in `docker-compose.yml`.
3. What is the target minimum hardware? Pi 4 (4GB) changes several model and routing decisions vs. Pi 5 (8GB).
4. Is there a planned multi-node topology (star with a central "hub" Attic, or fully peer-to-peer)? This significantly affects the Yjs sync transport design.
5. Should CoT event generation be bidirectional (Attic AI produces CoT events for ATAK clients) or receive-only?

---

## Sources

- [Best CRDT Libraries 2025 — Velt](https://velt.dev/blog/best-crdt-libraries-real-time-data-sync)
- [Yjs vs Automerge npm trends](https://npmtrends.com/automerge-vs-yjs)
- [Loro CRDT — loro.dev](https://loro.dev/)
- [SyncKit HN thread](https://news.ycombinator.com/item?id=46069598)
- [PowerSync Node.js SDK](https://powersync-ja.github.io/powersync-js/node-sdk)
- [whisper.cpp — ggml-org](https://github.com/ggml-org/whisper.cpp)
- [Offline STT: Browser + Node.js — AssemblyAI](https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js)
- [Valhalla routing engine](https://github.com/valhalla/valhalla)
- [Valhalla Docker self-hosted — Robin's Blog](https://blog.rtwilson.com/simple-self-hosted-openstreetmap-routing-using-valhalla-and-docker/)
- [OpenTAKServer docs](https://docs.opentakserver.io/)
- [OpenTAKServer Meshtastic bridge](https://docs.opentakserver.io/meshtastic.html)
- [TAK Meshtastic integration — Meshtastic blog](https://meshtastic.org/blog/tak-server-integration-ios/)
- [mesh-api (mr-tbot) — GitHub](https://github.com/mr-tbot/mesh-api)
- [LoRa Mesh + Federated Learning — ScienceDirect](https://www.sciencedirect.com/article/pii/S1574119223000779)
- [Sixfab UPS HAT](https://sixfab.com/product/raspberry-pi-power-management-ups-hat/)
- [Strato Pi Industrial RPi](https://sferalabs.cc/strato-pi/)
- [PV PI HAT MPPT solar — CNX Software](https://www.cnx-software.com/2025/11/13/the-pv-pi-hat-adds-10a-true-mppt-solar-charging-to-the-raspberry-pi/)
- [Kiwix offline knowledge](https://orchestrator.dev/blog/2025-12-12kiwix-offline-internet-article/)
- [Building offline KB with Kiwix + Docker Model Runner](https://albertoroura.com/building-an-offline-knowledge-base-with-zim-and-docker-model-runner/)
- [ATAK — Android Team Awareness Kit Wikipedia](https://en.wikipedia.org/wiki/Android_Team_Awareness_Kit)
- [FreeTAK Server — GitHub](https://github.com/FreeTAKTeam/FreeTakServer)
- [COOP Ultimate Guide — Juvare](https://www.juvare.com/thought-leadership/blogs/continuity-of-operations-guide/)
- [ICS-214 Activity Log — SF Controller](https://sfcontroller.org/sites/default/files/Documents/SFPreparedness/ICS%20214_-_Individual_Activity_Log.pdf)
