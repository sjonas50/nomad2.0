# The Attic AI — COOP Extension Architecture

This document extends `docs/architecture.md`. Read that document first. Everything here assumes the base stack (AdonisJS 7 + React 19 + Inertia.js, Ollama, Qdrant, FalkorDB, MySQL, Redis/BullMQ, Meshtastic, WiFi AP, Python sidecar) is operational.

---

## System Overview

The COOP extension adds six capability clusters to the base system: a structured ICS operational data model, offline voice capture and transcription, hardware watchdog/UPS monitoring, live GPS tracking on a map overlay, OpenTAKServer TAK ecosystem interoperability, and Yjs CRDT multi-node synchronization. All six are designed to operate with zero internet connectivity.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Docker Compose Host                                    │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         attic_admin (AdonisJS 7)                            │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐  │   │
│  │  │ React 19 /  │  │  AIChatOrchestrator   │  │     BullMQ Workers       │  │   │
│  │  │ Inertia.js  │  │  (+ COOP context      │  │  EmbedJob / EntityJob /  │  │   │
│  │  │             │  │   injection)           │  │  VoiceTranscribeJob /    │  │   │
│  │  │ /coop       │  └──────┬───────┬─────────┘  │  CotIngestJob            │  │   │
│  │  │ /map        │         │       │             └──────────┬───────────────┘  │   │
│  │  │ /incidents  │         │       │                        │                  │   │
│  │  │ /ops-board  │         │       │                        │                  │   │
│  │  │             │  ┌──────▼───────▼─────────────────────────────────────┐   │   │
│  │  │ MapLibre GL │  │                  Service Layer                      │   │   │
│  │  │ + PMTiles   │  │                                                     │   │   │
│  │  │ + GPS WS    │  │  ICSService        VoiceService    SyncService      │   │   │
│  │  │             │  │  IncidentService   CotBridgeService GpsTrackService │   │   │
│  │  │ Yjs client  │  │  PlaybookService   WatchdogService                  │   │   │
│  │  └─────────────┘  └────┬──────────┬────────┬───────────┬───────────────┘   │   │
│  └───────────────────────┼──────────┼────────┼───────────┼────────────────────┘   │
│                           │          │        │           │                         │
│  ┌────────────────┐ ┌─────▼──────┐ ┌▼──────┐ │  ┌────────▼───────┐               │
│  │  attic_sidecar │ │   Ollama   │ │Qdrant │ │  │   FalkorDB     │               │
│  │  (Python/      │ │  :11434    │ │ :6333 │ │  │   :6380        │               │
│  │   FastAPI)     │ │            │ │       │ │  │                │               │
│  │                │ │  + whisper │ │ + coop│ │  │  + GPS tracks  │               │
│  │  /transcribe   │ │  .cpp proc │ │  RAG  │ │  │  + ICS graph   │               │
│  │  /cot/ingest   │ └────────────┘ │ colls │ │  │  + doc lineage │               │
│  │  /gps/poll     │                └───────┘ │  └────────────────┘               │
│  │  /health       │                          │                                    │
│  └───────┬────────┘               ┌──────────▼────────────────────────────────┐  │
│          │                        │          MySQL 8.0 + Redis                 │  │
│          │                        │                                            │  │
│          │                        │  incidents / essential_functions           │  │
│          │                        │  resources / activity_logs                 │  │
│          │                        │  personnel_status / playbook_templates     │  │
│          │                        │  node_positions (time-series)              │  │
│          │                        └────────────────────────────────────────────┘  │
│          │                                                                         │
│  ┌───────▼──────────────────────────────────────────────────────────────────────┐ │
│  │                         opentakserver (Docker)                               │ │
│  │  CoT XML bridge  ←→  Meshtastic Python lib  ←→  LoRa mesh nodes             │ │
│  │  TAK PLI / GeoChat ingest → CotBridgeService → ICS activity_logs            │ │
│  └────────────────────────────────────────────────────────────────────────────-─┘ │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                    y-websocket server (Node.js process)                      │  │
│  │  Yjs document hub  —  y-leveldb persistence  —  WiFi LAN sync               │  │
│  │  Meshtastic delta transport (hash exchange → full sync on WiFi reconnect)   │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
│  ══════════════════════  Host systemd (outside Docker)  ═════════════════════════  │
│  attic-watchdog.service  →  I2C UPS HAT polling  →  graceful shutdown trigger      │
│  bcm2835_wdt hardware watchdog  →  auto-reboot on hang                             │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Tier 1 Components

---

### C1. ICS Data Model + COOP Playbooks

**Purpose:** Provide the AI and operators with a structured operational picture — active incidents, essential functions, resource status, and an append-only activity log. This data is injected as structured RAG context on every COOP-related query so the AI reasons over live operational state, not just static knowledge.

**Technology:** MySQL 8.0 (structured records) + AdonisJS Lucid ORM models + Qdrant (playbook semantic search, separate collection `attic_coop_playbooks`) + FalkorDB (essential function dependency graph).

**Inputs:**
- Operator form submissions via React COOP pages
- Structured extractions from VoiceService (voice → ICS activity log)
- CoT event ingest from CotBridgeService (TAK GeoChat → activity_log)

**Outputs:**
- Structured context blocks injected into `AIChatOrchestrator` system prompt when incident is active
- ICS form exports (ICS-211, ICS-213RR, ICS-214) as rendered HTML/PDF via AdonisJS route
- PlaybookService returns top-3 relevant playbooks at incident declaration (Qdrant semantic search on `attic_coop_playbooks`)

**Key Decisions:**
- MySQL over Qdrant for structured ICS records because relational integrity matters — a deleted resource or personnel record has operational consequences. Qdrant handles the semantic search surface for playbooks only.
- FalkorDB models the dependency graph between essential functions (`(EF_A)-[:DEPENDS_ON]->(EF_B)`) so the AI can answer "if communications goes down, what else is at risk?" without a query that joins five tables.
- Activity logs are append-only. No UPDATE on `activity_logs`. Corrections are new records with `corrects_id` FK.

---

### C2. VoiceService + whisper.cpp Transcription Pipeline

**Purpose:** Allow field operators to speak an update rather than type it. Audio is captured in the browser, uploaded as a WAV, transcribed offline via whisper.cpp, then structured by Ollama into an ICS ActivityLog entry.

**Technology:**
- Browser: `MediaRecorder` API → WAV blob → `multipart/form-data` POST to `/api/voice/upload`
- AdonisJS: `VoiceTranscribeJob` (BullMQ) → HTTP POST to Python sidecar `/transcribe`
- Python sidecar: `subprocess` call to `whisper.cpp` binary (model: `base.en` on Pi 5, `tiny.en` on Pi 4) → raw transcript string
- AdonisJS: raw transcript → `OllamaService` with `ICS_EXTRACTION_PROMPT` → structured JSON → `ActivityLog` record insert

**Inputs:** WAV audio file (≤ 5 minutes, browser-recorded), active `incident_id` from session context.

**Outputs:** `ActivityLog` row with `source: 'voice'`, transcript stored in `raw_transcript` field, structured fields (`actor`, `activity`, `resources_mentioned`) populated by Ollama extraction.

**Key Decisions:**
- Processing is async via BullMQ — the browser gets a job ID immediately and polls for completion. Voice transcription on a Pi 4 with `tiny.en` takes 20-60 seconds; blocking the HTTP response is not acceptable.
- whisper.cpp binary is managed outside Docker, installed on the host at `/usr/local/bin/whisper-cpp`. The Python sidecar calls it via subprocess. This avoids GPU driver and shared-memory complexity inside the container.
- `base.en` on Pi 5 gives ~80% WER for field speech; `tiny.en` on Pi 4 gives ~70% WER. Ollama's extraction step corrects common errors for the structured fields that matter (names, resource types, numbers).

**Sidecar endpoint:**
```
POST /transcribe
Content-Type: multipart/form-data
  - audio: WAV file
  - model: "base.en" | "tiny.en"
  - language: "en"

Response: { "transcript": "string", "duration_seconds": float }
```

---

### C3. Hardware Watchdog + UPS Monitor

**Purpose:** Keep the system alive and protect data integrity during power events. Two independent mechanisms: (1) a systemd service polling the UPS HAT over I2C to trigger graceful shutdown before battery exhaustion, (2) the Pi's hardware watchdog (`bcm2835_wdt`) to auto-reboot on system hang.

**Technology:**
- `attic-watchdog.service` (Python script, host systemd, not Docker): polls Sixfab UPS HAT or PV-PI HAT via `smbus2` library over I2C every 30 seconds.
- Sixfab registers: battery percentage at `0x2A`, charging state at `0x26` (I2C address `0x41`).
- PV-PI HAT (BQ25756 controller): different register map, same pattern.
- On battery ≤ 15%: write battery state to Redis key `system:battery` (for UI display), log to `activity_logs` with `source: 'system'`, initiate `docker compose stop` with 60-second timeout.
- Hardware watchdog: configured in `/etc/systemd/system.conf` (`RuntimeWatchdogSec=30`) and `/boot/config.txt` (`dtparam=watchdog=on`).

**Inputs:** I2C bus reads from UPS HAT (battery %, voltage, charging state).

**Outputs:**
- Redis key `system:battery` (TTL 60s) consumed by frontend status bar
- `activity_logs` insert on threshold events
- `systemctl start attic-shutdown.target` on critical battery

**Key Decisions:**
- This service runs on the host, not inside Docker, because it must be able to stop Docker gracefully. A containerized service cannot reliably issue `docker compose stop` to its own compose stack.
- `overlayroot` is configured separately (see Hardware Considerations section) — the watchdog service depends on it but does not manage it.
- Battery state is surfaced in the UI via a Redis-backed polling endpoint (`GET /api/system/status`) so operators can see power state at a glance.

---

### Tier 2 Components

---

### C4. Meshtastic GPS → MapLibre Live Overlay

**Purpose:** Display real-time positions of all Meshtastic mesh nodes on the offline map. Build a position history track in FalkorDB for replay and pattern analysis.

**Technology:**
- Python sidecar: new `GpsPollService` using `meshtastic` Python library (TCP or serial connection to Meshtastic device). Polls `MAP_REPORT` and `POSITION` packet types.
- Sidecar pushes position updates to AdonisJS via internal HTTP `POST /api/internal/gps/position`.
- AdonisJS: `GpsTrackService` inserts to `node_positions` MySQL table and publishes to Redis pub/sub channel `gps:updates`.
- AdonisJS WebSocket handler (`app/ws/gps_channel.ts`) subscribes to Redis channel and pushes to connected browser clients.
- Browser: MapLibre GL JS with PMTiles base layer + a GeoJSON source updated in real-time from WebSocket. Node markers rendered with callsign, battery %, last-seen timestamp.
- FalkorDB: `GpsTrackService` also writes `(MeshNode {node_id})-[:AT {timestamp, lat, lon, altitude}]->(GeoPoint)` — enables track replay queries.

**Inputs:** Meshtastic `POSITION` and `MAP_REPORT` packets (node ID, lat, lon, altitude, battery %).

**Outputs:**
- MySQL `node_positions` rows (time-series, pruned after 30 days)
- Redis pub/sub events consumed by WebSocket handler
- FalkorDB position graph (pruned per incident lifecycle)
- GeoJSON feature collection served to MapLibre frontend

**Key Decisions:**
- Sidecar polls Meshtastic via TCP (`meshtastic --host 127.0.0.1`) rather than serial when a Meshtastic device exposes a TCP bridge. Serial is the fallback. The `MESHTASTIC_CONNECTION` env var switches between modes.
- Position updates are fan-out via Redis pub/sub rather than storing in BullMQ — position data is ephemeral and high-frequency. BullMQ is for durable work items.
- MapLibre is already in the stack (PMTiles). The GPS overlay is an additive GeoJSON layer — no new mapping library dependency.

**Sidecar endpoint (internal, called by sidecar itself):**
```
POST /api/internal/gps/position   (AdonisJS receives from sidecar)
Body: { node_id, callsign, lat, lon, altitude, battery_pct, timestamp }
```

---

### C5. OpenTAKServer Integration

**Purpose:** Bridge between The Attic AI and the TAK ecosystem (ATAK/iTAK clients used by emergency responders). Bidirectional: ingest TAK PLI and GeoChat events as structured ICS data; publish mesh node positions as CoT PLI so TAK clients see Meshtastic nodes on their maps.

**Technology:**
- OpenTAKServer v1.7.0: Python/Flask, Docker Compose service, ARM64-compatible.
- `CotBridgeService` (AdonisJS): subscribes to OpenTAKServer's event stream via Server-Sent Events or WebSocket (OTS provides both). Parses CoT XML events.
- `CotIngestJob` (BullMQ): processes each CoT event asynchronously — PLI events → `node_positions` update; GeoChat events → `activity_logs` insert with `source: 'tak'`.
- CoT publisher: `GpsTrackService` also formats Meshtastic positions as CoT PLI XML and POSTs to `http://opentakserver:8080/api/cot` so TAK clients see mesh nodes.

**Inputs:**
- CoT XML events from OpenTAKServer (TAK client PLI, GeoChat messages, sensor events)
- Meshtastic node positions (for outbound CoT generation)

**Outputs:**
- `node_positions` rows from TAK PLI events
- `activity_logs` rows from GeoChat messages (actor derived from TAK UID/callsign)
- Outbound CoT PLI XML published back to OpenTAKServer for TAK client consumption

**Key Decisions:**
- Implement only standard CoT event types: `a-f-G-U-C` (friendly ground unit PLI), `b-t-f` (GeoChat). Proprietary ATAK plugin CoT extensions are explicitly out of scope — the interop surface must remain stable.
- OpenTAKServer handles Meshtastic bridging natively (built-in since v1.7.0). The Attic AI does not need to duplicate that bridge; it consumes OTS's output.
- CoT XML parsing uses a lightweight hand-written parser (CoT is a shallow XML schema). No heavyweight XML library added to the Node.js bundle.

**Docker service:** See Docker Compose section below.

---

### C6. Yjs CRDT Multi-Node Sync

**Purpose:** Allow multiple Attic nodes operating as isolated "islands" (no network) to merge their operational state when connectivity is restored — via WiFi LAN, Meshtastic mesh, or sneakernet USB. Conflict-free merge using operation-based CRDTs.

**Technology:**
- `yjs` 13.6.23: CRDT document library
- `y-leveldb` 7.0.0: LevelDB persistence for the Yjs document store (survives reboots)
- `y-websocket` server: standalone Node.js process (separate from AdonisJS) on port `1234`, bound to WiFi AP interface only
- Yjs document structure:
  - `Y.Map` `incidents` — keyed by incident ID, values are serialized ICS snapshots
  - `Y.Array` `activity_log_deltas` — append-only log of ActivityLog entries (Yjs enforces causal ordering)
  - `Y.Map` `personnel_status` — keyed by user ID, real-time check-in status
  - `Y.Map` `resource_status` — keyed by resource ID, current assignment/status
- Browser: `yjs` + `y-websocket` provider for real-time multi-user ops board editing
- Meshtastic delta transport: custom Python sidecar worker that computes state vector diff between local Yjs doc and remote node's last-known state vector; transmits only the diff hash over Meshtastic; full sync deferred to next WiFi connection
- Sneakernet: `GET /api/sync/snapshot` exports full Yjs binary state to `.yjs` file; `POST /api/sync/snapshot` imports it. Store alongside ZIM files for physical hand-off.

**Inputs:**
- Local operator edits (React frontend Yjs provider)
- Remote node state updates (WiFi WebSocket or sneakernet snapshot import)
- Meshtastic delta hash packets (trigger awareness of divergence, not full sync)

**Outputs:**
- Converged operational state replicated to all connected nodes
- Durable LevelDB snapshot at `/data/yjs/attic-ops.ldb`
- `.yjs` binary snapshot files for sneakernet export

**Key Decisions:**
- Yjs garbage collection is enabled (`ydoc.gc = true`) with a nightly snapshot+reset cycle via a BullMQ scheduled job. Without this, operation history grows unboundedly — a documented Yjs pitfall in long-running deployments.
- The y-websocket server runs as a separate process (not inside AdonisJS) because AdonisJS uses the `ws` library internally for its own WebSocket handling and mixing the two providers causes message routing conflicts.
- Meshtastic sync sends only delta hashes (32 bytes), not full Yjs update vectors. Full sync happens on WiFi reconnect. This is a deliberate protocol split: Meshtastic signals _that_ divergence occurred; WiFi resolves _what_ diverged.
- MySQL remains the source of truth for structured ICS records. Yjs is the real-time collaboration layer for the ops board. On every Yjs document mutation that affects an ICS entity, a BullMQ `YjsSyncJob` writes the canonical record back to MySQL. This prevents the Yjs doc from being the only copy.

---

## Data Flow Sequences

### Sequence 1: Incident Declaration

```
Operator (browser)        AdonisJS              MySQL         Qdrant (playbooks)    FalkorDB        Yjs doc
      │                      │                    │                  │                  │               │
      │── POST /api/         │                    │                  │                  │               │
      │   incidents ────────▶│                    │                  │                  │               │
      │                      │── INSERT incidents▶│                  │                  │               │
      │                      │── INSERT            │                  │                  │               │
      │                      │   essential_funcs ─▶│                  │                  │               │
      │                      │◀── {incident_id} ──│                  │                  │               │
      │                      │                    │                  │                  │               │
      │                      │── semantic search                                        │               │
      │                      │   "incident.type + name" ─────────────▶│                │               │
      │                      │◀── top-3 playbooks ────────────────────│                │               │
      │                      │                    │                  │                  │               │
      │                      │── MERGE EF graph ──────────────────────────────────────▶│               │
      │                      │   (EF nodes +       │                  │                  │               │
      │                      │    DEPENDS_ON edges)│                  │                  │               │
      │                      │                    │                  │                  │               │
      │                      │── Y.Map incidents.set(id, snapshot) ──────────────────────────────────▶│
      │                      │   (broadcast to all │                  │                  │               │
      │                      │    connected nodes) │                  │                  │               │
      │                      │                    │                  │                  │               │
      │◀── 201 {incident,    │                    │                  │                  │               │
      │    playbooks[3],      │                    │                  │                  │               │
      │    dep_graph} ───────│                    │                  │                  │               │
      │                      │                    │                  │                  │               │
      │  (subsequent AI      │                    │                  │                  │               │
      │   chat queries now   │                    │                  │                  │               │
      │   receive ICS        │                    │                  │                  │               │
      │   context block      │                    │                  │                  │               │
      │   injected into      │                    │                  │                  │               │
      │   system prompt)     │                    │                  │                  │               │
```

### Sequence 2: Voice Capture Workflow

```
Browser                 AdonisJS             BullMQ          Python sidecar        Ollama           MySQL
  │                       │                    │                   │                  │                │
  │  [operator presses    │                    │                   │                  │                │
  │   record, speaks      │                    │                   │                  │                │
  │   status update]      │                    │                   │                  │                │
  │                       │                    │                   │                  │                │
  │── POST /api/voice/    │                    │                   │                  │                │
  │   upload (WAV, 30s) ─▶│                    │                   │                  │                │
  │                       │── save to /tmp/ ──▶│                   │                  │                │
  │                       │── enqueue          │                   │                  │                │
  │                       │   VoiceTranscribe  │                   │                  │                │
  │                       │   Job ────────────▶│                   │                  │                │
  │◀── 202 {job_id} ──────│                    │                   │                  │                │
  │                       │                    │                   │                  │                │
  │  [polls GET           │                    │                   │                  │                │
  │   /api/jobs/{job_id}] │                    │                   │                  │                │
  │                       │                    │── POST /transcribe│                  │                │
  │                       │                    │   (WAV file) ─────▶                  │                │
  │                       │                    │                   │── exec whisper   │                │
  │                       │                    │                   │   .cpp binary    │                │
  │                       │                    │                   │   (20-60s)       │                │
  │                       │                    │◀── {transcript} ──│                  │                │
  │                       │                    │                   │                  │                │
  │                       │                    │── POST Ollama      │                  │                │
  │                       │                    │   /api/chat (ICS  │                  │                │
  │                       │                    │   extraction      │                  │                │
  │                       │                    │   prompt + text) ──────────────────▶│                │
  │                       │                    │◀── {actor, activity,                 │                │
  │                       │                    │    resources, type} ────────────────│                │
  │                       │                    │                   │                  │                │
  │                       │                    │── INSERT          │                  │                │
  │                       │                    │   activity_logs ───────────────────────────────────▶│
  │                       │                    │   (source:'voice')│                  │                │
  │                       │                    │                   │                  │                │
  │◀── job status:        │                    │                   │                  │                │
  │    complete +         │                    │                   │                  │                │
  │    activity_log row ──│                    │                   │                  │                │
```

### Sequence 3: Multi-Node Sync (WiFi Reconnect)

```
Node A (y-websocket)          Yjs CRDT layer           Node B (y-websocket)
       │                             │                          │
       │  [WiFi link established]    │                          │
       │                             │                          │
       │── WebSocket connect ────────────────────────────────▶│
       │                             │                          │
       │── send state vector ────────────────────────────────▶│
       │   (compact 32-byte hash     │                          │
       │    of local doc state)      │                          │
       │                             │                          │
       │                             │◀── send state vector ────│
       │                             │    (Node B's local hash) │
       │                             │                          │
       │  [Yjs computes diff:        │                          │
       │   which ops does B          │                          │
       │   not have?]                │                          │
       │                             │                          │
       │── send missing ops ─────────────────────────────────▶│
       │   (binary encoded,          │                          │
       │    only the delta)          │                          │
       │                             │                          │
       │◀── send B's missing ops ────│                          │
       │    (B → A delta)            │                          │
       │                             │                          │
       │  [both docs apply ops,      │                          │
       │   converge to same state    │                          │
       │   deterministically]        │                          │
       │                             │                          │
       │── BullMQ YjsSyncJob ────────▶                         │
       │   (write canonical          │                          │
       │    ICS records back         │                          │
       │    to MySQL)                │                          │

[Meshtastic path — bandwidth constrained, divergence detection only]

Node A (Python sidecar)       Meshtastic mesh           Node B (Python sidecar)
       │                             │                          │
       │── TX: {node_id, doc_hash,   │                          │
       │    vector_clock} ──────────▶│──────────────────────────▶│
       │   (< 50 bytes)              │                          │
       │                             │                          │
       │                             │◀── RX: {node_id, hash} ──│
       │  [hash mismatch detected:   │                          │
       │   flag Node B for full      │                          │
       │   sync when WiFi reconnects]│                          │
       │                             │                          │
       │  [no full Yjs update        │                          │
       │   transmitted over mesh]    │                          │
```

### Sequence 4: GPS Tracking (Meshtastic → Map)

```
Meshtastic net     Python sidecar      AdonisJS GpsTrackSvc    Redis pub/sub    Browser (MapLibre)
       │                 │                      │                    │                 │
       │  POSITION       │                      │                    │                 │
       │  packet ───────▶│                      │                    │                 │
       │  (node_id,       │                      │                    │                 │
       │   lat, lon,      │                      │                    │                 │
       │   alt, batt%)    │                      │                    │                 │
       │                 │── POST /api/internal/ │                    │                 │
       │                 │   gps/position ──────▶│                    │                 │
       │                 │                      │── INSERT            │                 │
       │                 │                      │   node_positions ──▶│                 │
       │                 │                      │── PUBLISH           │                 │
       │                 │                      │   gps:updates ─────▶│                 │
       │                 │                      │                    │── WS push ──────▶│
       │                 │                      │                    │   {node_id,      │
       │                 │                      │                    │    lat, lon,     │
       │                 │                      │                    │    callsign,     │
       │                 │                      │                    │    batt%}        │
       │                 │                      │                    │                 │
       │                 │                      │                    │                 │── update GeoJSON
       │                 │                      │                    │                 │   source on map
       │                 │                      │                    │                 │   (no page reload)
       │                 │                      │                    │                 │
       │                 │                      │── FalkorDB MERGE   │                 │
       │                 │                      │   (MeshNode)-      │                 │
       │                 │                      │   [:AT {ts}]->     │                 │
       │                 │                      │   (GeoPoint)       │                 │
```

---

## Database Schema Additions

### MySQL — New Tables

```sql
-- Top-level incident container (ICS Form 201)
CREATE TABLE incidents (
  id             CHAR(36) PRIMARY KEY,           -- UUID
  name           VARCHAR(255) NOT NULL,
  incident_type  ENUM('natural_disaster','infrastructure_failure',
                      'security','medical','other') NOT NULL,
  status         ENUM('declared','active','contained','closed')
                   NOT NULL DEFAULT 'declared',
  iap_period     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  declared_at    DATETIME(3) NOT NULL,
  closed_at      DATETIME(3) NULL,
  incident_commander_id BIGINT UNSIGNED NULL,
  summary        TEXT NULL,
  created_at     DATETIME(3) NOT NULL,
  updated_at     DATETIME(3) NOT NULL,
  FOREIGN KEY (incident_commander_id) REFERENCES users(id) ON DELETE SET NULL
);

-- FEMA-tiered essential functions (ICS COOP annex)
CREATE TABLE essential_functions (
  id               CHAR(36) PRIMARY KEY,
  incident_id      CHAR(36) NOT NULL,
  name             VARCHAR(255) NOT NULL,
  priority         TINYINT UNSIGNED NOT NULL,    -- 1=critical, 2=important, 3=supporting
  status           ENUM('nominal','degraded','failed') NOT NULL DEFAULT 'nominal',
  description      TEXT NULL,
  created_at       DATETIME(3) NOT NULL,
  updated_at       DATETIME(3) NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

-- Resources (ICS 204 / 211)
CREATE TABLE resources (
  id             CHAR(36) PRIMARY KEY,
  resource_type  VARCHAR(100) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  quantity       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  lat            DECIMAL(9,6) NULL,
  lon            DECIMAL(9,6) NULL,
  status         ENUM('available','assigned','out_of_service','consumed')
                   NOT NULL DEFAULT 'available',
  assigned_to_incident_id CHAR(36) NULL,
  notes          TEXT NULL,
  created_at     DATETIME(3) NOT NULL,
  updated_at     DATETIME(3) NOT NULL,
  FOREIGN KEY (assigned_to_incident_id) REFERENCES incidents(id) ON DELETE SET NULL
);

-- Append-only activity log (ICS 214)
CREATE TABLE activity_logs (
  id             CHAR(36) PRIMARY KEY,
  incident_id    CHAR(36) NOT NULL,
  actor_user_id  BIGINT UNSIGNED NULL,
  actor_callsign VARCHAR(64) NULL,              -- for TAK/Meshtastic actors without accounts
  activity       TEXT NOT NULL,
  source         ENUM('manual','voice','ai_extracted','tak','system')
                   NOT NULL DEFAULT 'manual',
  raw_transcript TEXT NULL,                     -- whisper.cpp output before extraction
  corrects_id    CHAR(36) NULL,                 -- FK to another activity_log (correction record)
  logged_at      DATETIME(3) NOT NULL,
  created_at     DATETIME(3) NOT NULL,
  -- NO updated_at: append-only, corrections are new rows
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (corrects_id) REFERENCES activity_logs(id) ON DELETE SET NULL
);

-- Real-time personnel accountability (ICS 211 PAR)
CREATE TABLE personnel_status (
  id             CHAR(36) PRIMARY KEY,
  user_id        BIGINT UNSIGNED NULL,
  callsign       VARCHAR(64) NOT NULL,
  incident_id    CHAR(36) NULL,
  status         ENUM('available','assigned','on_break','evacuated',
                       'injured','unknown') NOT NULL DEFAULT 'unknown',
  location_text  VARCHAR(255) NULL,
  lat            DECIMAL(9,6) NULL,
  lon            DECIMAL(9,6) NULL,
  checked_in_at  DATETIME(3) NULL,
  updated_at     DATETIME(3) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL
);

-- Playbook templates (seeded, not operator-created)
CREATE TABLE playbook_templates (
  id             CHAR(36) PRIMARY KEY,
  slug           VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'pace-plan', 'ics-213rr'
  title          VARCHAR(255) NOT NULL,
  form_type      ENUM('PAR_ICS211','ICS213RR','ICS214_AAR','PACE_PLAN','CUSTOM')
                   NOT NULL,
  content_md     LONGTEXT NOT NULL,             -- Markdown template with {{variable}} slots
  qdrant_point_id VARCHAR(64) NULL,             -- ID of corresponding Qdrant point
  version        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at     DATETIME(3) NOT NULL,
  updated_at     DATETIME(3) NOT NULL
);

-- Meshtastic + TAK node positions (time-series, pruned rolling 30 days)
CREATE TABLE node_positions (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  node_id        VARCHAR(32) NOT NULL,          -- Meshtastic node ID or TAK UID
  source         ENUM('meshtastic','tak') NOT NULL DEFAULT 'meshtastic',
  callsign       VARCHAR(64) NULL,
  lat            DECIMAL(9,6) NOT NULL,
  lon            DECIMAL(9,6) NOT NULL,
  altitude_m     SMALLINT NULL,
  battery_pct    TINYINT UNSIGNED NULL,
  recorded_at    DATETIME(3) NOT NULL,
  INDEX idx_node_recorded (node_id, recorded_at),
  INDEX idx_recorded (recorded_at)             -- for pruning job
);
```

### Seed Data

```sql
-- Playbook templates seeded at first boot via AdonisJS seeder
-- PlaybookTemplateSeeder.ts inserts the four canonical COOP templates:

-- 1. PACE Plan (Primary/Alternate/Contingency/Emergency comms)
-- 2. PAR / ICS-211 (Personnel Accountability Report check-in form)
-- 3. ICS-213RR (Resource Request — AI can extract from voice)
-- 4. ICS-214 AAR (After-Action Review — auto-populated from activity_logs)
```

### Qdrant — New Collection

```
attic_coop_playbooks
  - 768-dimensional dense vectors (nomic-embed-text, same as main collection)
  - Payload: { slug, title, form_type, version, incident_types[] }
  - Populated by PlaybookSeederJob at first boot
  - Searched at incident declaration to surface top-3 relevant playbooks
```

### FalkorDB — New Graph Schema

```cypher
-- Essential function dependency graph
CREATE (:EssentialFunction {id, incident_id, name, priority, status})
CREATE (:MeshNode {node_id, callsign, last_seen})
CREATE (:GeoPoint {lat, lon, altitude, timestamp})
CREATE (:Incident {id, name, status})

-- Relationships
(EF)-[:DEPENDS_ON {criticality: 'hard'|'soft'}]->(EF)
(Incident)-[:HAS_FUNCTION]->(EF)
(MeshNode)-[:AT {timestamp, battery_pct}]->(GeoPoint)
(MeshNode)-[:MEMBER_OF]->(Incident)

-- Document lineage (existing pattern, extended for ICS)
(PlaybookV1)-[:SUPERSEDED_BY]->(PlaybookV2)
```

---

## New Environment Variables

```bash
# ── COOP / ICS ─────────────────────────────────────────────────────────────
# Enable COOP incident management features
COOP_ENABLED=true

# Qdrant collection name for COOP playbooks (separate from main KB)
QDRANT_COOP_COLLECTION=attic_coop_playbooks

# ── Voice / Whisper ─────────────────────────────────────────────────────────
# Path to whisper.cpp binary on the host (not inside Docker)
WHISPER_BIN=/usr/local/bin/whisper-cpp

# Model selection: base.en (Pi 5, 8GB+) or tiny.en (Pi 4, 4GB)
WHISPER_MODEL=base.en

# Path to whisper model files directory
WHISPER_MODEL_DIR=/data/models/whisper

# Max audio upload size in MB
VOICE_MAX_UPLOAD_MB=25

# ── GPS / Meshtastic ────────────────────────────────────────────────────────
# Connection mode: tcp or serial
MESHTASTIC_CONNECTION=tcp

# TCP host for Meshtastic device (when MESHTASTIC_CONNECTION=tcp)
MESHTASTIC_HOST=127.0.0.1
MESHTASTIC_PORT=4403

# Serial device (when MESHTASTIC_CONNECTION=serial)
MESHTASTIC_SERIAL_DEVICE=/dev/ttyUSB0

# How often the GPS poll loop runs (seconds)
GPS_POLL_INTERVAL_SECONDS=10

# Days of node_positions history to retain before pruning
GPS_HISTORY_RETENTION_DAYS=30

# ── OpenTAKServer ───────────────────────────────────────────────────────────
OPENTAKSERVER_ENABLED=false
OPENTAKSERVER_HOST=http://opentakserver:8080
OPENTAKSERVER_API_KEY=<generated-at-first-boot>

# This node's CoT UID (published to TAK clients as a team element)
ATTIC_COT_UID=ATTIC-NODE-01
ATTIC_COT_CALLSIGN=ATTIC-01

# ── Yjs CRDT Sync ──────────────────────────────────────────────────────────
YJS_ENABLED=true

# y-websocket server listens on this port (WiFi AP interface only)
YJS_WS_PORT=1234

# Path to LevelDB persistence directory
YJS_LEVELDB_DIR=/data/yjs

# Yjs snapshot export directory (for sneakernet .yjs files)
YJS_SNAPSHOT_DIR=/data/yjs/snapshots

# How often the nightly GC snapshot+reset job runs (cron expression)
YJS_GC_CRON=0 2 * * *

# ── UPS / Watchdog ──────────────────────────────────────────────────────────
# UPS HAT type: sixfab or pvpi (affects I2C register map)
UPS_HAT_TYPE=sixfab

# I2C bus number (usually 1 on Pi)
UPS_I2C_BUS=1

# Battery percentage at which graceful shutdown is initiated
UPS_SHUTDOWN_THRESHOLD_PCT=15

# Battery percentage warning level (surfaced to UI)
UPS_WARNING_THRESHOLD_PCT=30

# ── System Status ───────────────────────────────────────────────────────────
# Redis key TTL for battery state (seconds)
SYSTEM_STATUS_REDIS_TTL=60
```

---

## New Docker Compose Services

```yaml
# docker-compose.coop.yml  (overlay file: docker compose -f docker-compose.yml -f docker-compose.coop.yml up)

services:

  opentakserver:
    image: ghcr.io/opentakserver/opentakserver:1.7.0
    container_name: opentakserver
    restart: unless-stopped
    profiles: ["coop", "full"]
    ports:
      - "8080:8080"      # OTS HTTP API (internal only — do not expose on WAN)
      - "8443:8443"      # OTS HTTPS (TAK client TLS)
      - "8089:8089"      # TAK client TCP (ATAK legacy)
    volumes:
      - opentakserver_data:/data/opentakserver
    environment:
      OTS_MESHTASTIC_ENABLED: "true"
      OTS_MESHTASTIC_HOST: "${MESHTASTIC_HOST:-127.0.0.1}"
      OTS_MESHTASTIC_PORT: "${MESHTASTIC_PORT:-4403}"
    networks:
      - attic_internal
    mem_limit: 512m
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  yjs-server:
    image: node:22-alpine
    container_name: yjs_server
    restart: unless-stopped
    profiles: ["coop", "full"]
    working_dir: /app
    command: ["node", "server.js"]
    volumes:
      - ./yjs-server:/app          # small standalone Node.js process
      - yjs_leveldb:/data/yjs
    environment:
      YJS_WS_PORT: "${YJS_WS_PORT:-1234}"
      YJS_LEVELDB_DIR: /data/yjs
      YJS_GC_CRON: "${YJS_GC_CRON:-0 2 * * *}"
    ports:
      - "1234:1234"                # WiFi AP interface bind handled in yjs-server/server.js
    networks:
      - attic_internal
    mem_limit: 128m

volumes:
  opentakserver_data:
  yjs_leveldb:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/yjs            # USB SSD — survives SD card overlayroot
```

**Compose profiles summary after COOP extension:**

| Profile | Services Added | Use Case |
|---------|---------------|----------|
| `base` | AdonisJS, Ollama, Qdrant, MySQL, Redis | Minimum viable |
| `graph` | + FalkorDB | Hybrid RAG, 16GB+ |
| `full` | + FalkorDB, sidecar, OTS, y-websocket | Full COOP, 16GB+ |
| `coop` | + OTS, y-websocket (no graph) | COOP without graph RAG, 8GB |

---

## Hardware Considerations

### Pi 4 (4GB) — Constrained Profile

- **Whisper model**: `tiny.en` only. `base.en` requires ~1.8GB RAM during inference; combined with Ollama idle overhead (~200MB), Qdrant (~100MB), AdonisJS (~120MB), and MySQL (~300MB), `base.en` will trigger OOM on 4GB.
- **FalkorDB**: Disabled. The `graph` and `full` profiles must not run on Pi 4 4GB.
- **OpenTAKServer**: Technically fits (512MB limit), but running Ollama inference + OTS simultaneously is marginal. Use `coop` profile without `graph`, and configure BullMQ to process voice jobs with concurrency=1 and an explicit Ollama mutex.
- **Recommended Ollama model**: `llama3.2:1b` (quantized, ~800MB VRAM/RAM).
- **Yjs server**: Runs fine at ~50MB idle.

### Pi 4 (8GB) — Recommended Minimum for Full COOP

- `base.en` whisper model fits.
- FalkorDB fits at idle (~80MB), but watch for growth during active incidents.
- **Recommended Ollama model**: `mistral:7b-instruct-q4_K_M` (~4.1GB).
- All COOP services viable on the `full` profile with memory limits enforced.

### Pi 5 (8GB) — Recommended Platform

- Pi 5's improved memory bandwidth (LPDDR4X vs LPDDR4 on Pi 4) makes a measurable difference for whisper.cpp and Ollama throughput.
- `base.en` transcribes at ~3-5x real-time on Pi 5 vs ~1-2x on Pi 4.
- All `full` profile services fit with headroom.

### Memory Limit Recommendations (docker-compose.yml)

```yaml
# Enforced memory limits for COOP profile on 8GB hardware
services:
  attic_admin:
    mem_limit: 512m
  ollama:
    mem_limit: 5g        # headroom for 7B quantized model
  qdrant:
    mem_limit: 512m
  falkordb:
    mem_limit: 1g
  mysql:
    mem_limit: 512m
  redis:
    mem_limit: 256m
  sidecar:
    mem_limit: 512m      # whisper subprocess peaks at ~1.8GB on base.en — use host mem, not container limit
  opentakserver:
    mem_limit: 512m
  yjs-server:
    mem_limit: 128m
```

Note: The whisper.cpp subprocess is launched by the sidecar container but is not a container itself — it runs as a child process inside the sidecar container. The sidecar's `mem_limit` does not fully bound the subprocess on all kernels. If OOM events occur, lower `WHISPER_MODEL` to `tiny.en`.

### Storage Layout (USB SSD at `/data`)

```
/data/
├── qdrant/         # Qdrant storage (mapped from container)
├── falkordb/       # FalkorDB AOF persistence
├── uploads/        # Knowledge base uploads (ZIM files, documents)
├── models/
│   └── whisper/    # whisper.cpp model files (base.en.bin, tiny.en.bin)
├── yjs/
│   ├── attic-ops.ldb/    # LevelDB directory
│   └── snapshots/        # .yjs sneakernet snapshots
└── opentakserver/  # OTS certs, database
```

### overlayroot + Docker Compatibility

The overlayroot filesystem driver and Docker's overlay2 storage driver conflict on kernels < 6.1 when both are active on the same mount. Resolution:

1. Use overlayroot on the SD card root filesystem (`/`).
2. Mount the USB SSD at `/data` as a normal ext4 volume (not covered by overlayroot).
3. In Docker `daemon.json`, set `"data-root": "/data/docker"` so all Docker layer cache lives on the SSD.
4. This ensures: SD card is read-only protected by overlayroot; Docker has full write access on the SSD; no driver conflict.

Test this configuration on target hardware before field deployment. The overlayroot + Docker interaction is kernel-version-dependent.

---

## Integration Points with Existing Architecture

### AIChatOrchestrator — COOP Context Injection

When an active incident exists, `AIChatOrchestrator` injects a structured COOP context block into the system prompt before generation:

```
[ACTIVE INCIDENT: Operation Winter Storm — Period 3]
Status: ACTIVE | Commander: J. Smith | Declared: 2025-03-23 14:32

Essential Functions:
  [NOMINAL] EF-1: Emergency Communications (Priority 1)
  [DEGRADED] EF-2: Medical Support (Priority 1) — primary personnel unavailable
  [NOMINAL] EF-3: Shelter Management (Priority 2)

Recent Activity (last 3 entries):
  14:45 [voice] Sgt. Williams — Shelter B at capacity, requesting additional cots (ICS-213RR pending)
  14:38 [manual] J. Smith — Medical team rerouted to Station 7
  14:32 [system] Incident declared by J. Smith

Resources: 3 available / 12 assigned / 1 out-of-service
```

This block is assembled by `ICSService.buildContextBlock(incident_id)` and prepended to the standard RAG context. The AI can then answer questions like "what essential functions are at risk?" or "draft an ICS-213RR for the cots request" grounded in live operational state.

### BullMQ — New Job Types

| Job | Queue | Concurrency | Description |
|-----|-------|-------------|-------------|
| `VoiceTranscribeJob` | `voice` | 1 | WAV → whisper.cpp → Ollama extraction → ActivityLog |
| `CotIngestJob` | `cot` | 2 | CoT XML event → parse → ICS record insert |
| `YjsSyncJob` | `sync` | 1 | Yjs mutation → write canonical record back to MySQL |
| `GpsPruneJob` | `maintenance` | 1 | Delete node_positions rows older than retention limit |
| `YjsGcJob` | `maintenance` | 1 | Yjs snapshot+reset cycle (nightly, prevents history bloat) |
| `PlaybookIndexJob` | `ingestion` | 1 | Seed/reindex playbook templates into Qdrant coop collection |

### Python Sidecar — New Endpoints

```
POST /transcribe          — WAV → whisper.cpp transcript
POST /cot/ingest          — CoT XML → parsed dict (called by CotBridgeService)
GET  /gps/poll            — Trigger a manual Meshtastic position poll
GET  /health              — Extended: includes whisper binary check + Meshtastic connection state
```

---

## Known Pitfalls (COOP-Specific)

1. **Yjs GC**: Without the nightly `YjsGcJob`, the LevelDB store grows without bound. A 72-hour active incident generating 1 op/second accumulates ~260K operations — roughly 50MB uncompressed. Not catastrophic on Pi 5 but will degrade sync performance over weeks.

2. **whisper.cpp subprocess memory**: The subprocess launched by the sidecar inherits the container's cgroups but the memory is attributed to the container. On `base.en`, the peak is ~1.8GB. Set Docker's `mem_limit` on the sidecar to at least 2.5GB, or use `tiny.en` on constrained hardware.

3. **CoT XML vendor extensions**: ATAK plugins frequently emit non-standard `<detail>` subtrees. The CoT parser must be written defensively — extract only `uid`, `type`, `time`, `lat`, `lon`, `callsign` from standard fields. Log and drop unknown extensions rather than failing.

4. **FalkorDB graph growth during active incidents**: Position history and activity log nodes accumulate fast. Implement the `GpsPruneJob` before the first real incident deployment. The FalkorDB graph pruning query is `MATCH (n:GeoPoint) WHERE n.timestamp < $cutoff DETACH DELETE n`.

5. **MySQL append-only for activity_logs**: The schema enforces no `updated_at`. AdonisJS Lucid models will try to set `updated_at` on save by default — override this with `static readonly selfAssignPrimaryKey = true` and disable auto-timestamps on the `ActivityLog` model explicitly.

6. **overlayroot on Pi 4 with kernel < 6.1**: overlayroot uses `overlayfs` for the root mount. Docker also uses `overlayfs` for its layer cache. On kernels before 6.1, nested overlayfs is not supported. Raspberry Pi OS Bookworm ships kernel 6.6+ — verify the installed kernel version before configuring overlayroot.

7. **OpenTAKServer first-boot cert generation**: OTS generates TLS certificates on first start. This takes 30-60 seconds and the healthcheck will fail during this window. Set `start_period: 90s` on the OTS Docker healthcheck to avoid compose restart loops.

8. **Meshtastic TCP vs serial**: The Python `meshtastic` library's TCP interface connects to the Meshtastic firmware's built-in TCP bridge (port 4403). This only works when the Meshtastic device is connected via USB and the `meshtasticd` daemon (or equivalent) is running on the host. The serial path is more reliable for production deployment — use TCP only for development.
