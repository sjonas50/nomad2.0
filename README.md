# The Attic AI

An AI-first, offline-capable knowledge platform built for disaster response, continuity of operations, and edge deployments. Run local LLMs, manage incidents with ICS/BCP playbooks, capture voice logs, sync data via encrypted USB bundles, bridge into TAK networks, and track positions on offline maps — all from a single self-hosted interface that works when the internet doesn't.

## Who It's For

- **Government & Emergency Management** — ICS-compliant incident management with NIMS-standard activity logs, personnel accountability, and PACE communication plans
- **Enterprise** — Business continuity planning with recovery priority matrices, impact analysis templates, and encrypted data bundles for disaster recovery
- **Preparedness Communities** — Offline-first knowledge persistence, mesh networking, voice capture, and sneakernet data sync for when infrastructure fails

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  AdonisJS 7 + React 19 + Inertia.js                                 │
│                                                                      │
│  Chat UI ──▶ AIChatOrchestrator ──▶ OllamaService (local LLM)      │
│              │  intent classify       │  async mutex                 │
│              │  tool routing          │  model management            │
│              │  ICS context inject    │  streaming generation        │
│              │                        │                              │
│              ├──▶ RetrievalService    ├──▶ EmbeddingService          │
│              │    vector + graph RRF  │    nomic-embed-text          │
│              │                        │    768-dim batched            │
│              ├──▶ ToolRegistry        └──▶ ChunkingService           │
│              │    10 tools + RBAC         1700-token windows         │
│              │                                                       │
│              ├──▶ ICSService          ──▶ VoiceCaptureService        │
│              │    incident lifecycle       whisper.cpp transcription  │
│              │    AAR generation           structured extraction      │
│              │                                                       │
│              ├──▶ BundleService       ──▶ SyncService                │
│              │    .attic export/import     Yjs state hashing         │
│              │    AES-256-GCM encrypt     peer discovery (mDNS)      │
│              │                                                       │
│              └──▶ CoTService          ──▶ PositionService            │
│                   TAK XML bridge          GPS tracking + geofencing   │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐   │
│  │  Ollama  │ │  Qdrant  │ │ FalkorDB │ │    Python Sidecar    │   │
│  │  :11434  │ │  :6333   │ │  :6380   │ │    FastAPI :8100     │   │
│  │ qwen2.5  │ │ 768d cos │ │  Cypher  │ │ ZIM + entities +     │   │
│  │ nomic    │ │ + sparse │ │  graphs  │ │ whisper.cpp (voice)  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐                      │
│  │ MySQL 8  │ │ Redis 7  │ │ OpenTAKServer  │                      │
│  │  :3306   │ │  :6379   │ │ :8089 CoT TCP  │                      │
│  └──────────┘ └──────────┘ └────────────────┘                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Features

### Incident Command System (ICS)
- Declare, activate, contain, and close incidents with full lifecycle tracking
- ICS-214 style activity logs (append-only with correction references, never overwrite)
- Personnel accountability (PAR) with check-in via manual, mesh, or voice
- Essential function tracking with FEMA priority tiers and recovery time objectives
- PACE communication trees (Primary/Alternate/Contingency/Emergency)
- AI-synthesized After-Action Reports from chronological activity logs
- Active incident context auto-injected into AI chat system prompt

### Business Continuity Planning (BCP)
- 9 built-in templates: Business Impact Analysis, Recovery Priority Matrix, Communication Cascade, IT Disaster Recovery, and 5 ICS forms
- Templates stored as structured prompt templates with `ics` and `bcp` categories
- Recovery time objectives tracked per essential function

### Voice Capture & Structured Extraction
- Browser-based audio recording (push-to-record, compact and full modes)
- Offline transcription via whisper.cpp (Metal GPU acceleration on Apple Silicon)
- LLM-powered extraction: transcript → structured ICS activity log entries
- Automatic categorization (decision/observation/communication/resource_change)
- Resource and actor extraction from voice transcripts
- Graceful fallback when LLM unavailable (raw transcript preserved)

### Data Sync & Sneakernet
- `.attic` bundle format: single encrypted tar.gz containing MySQL dump, Qdrant snapshot, and Yjs state
- AES-256-GCM encryption with scrypt key derivation for gov/enterprise compliance
- CLI commands: `node ace sync:export` and `node ace sync:import` with `--passphrase` flag
- Web UI for export/import/download bundles
- Peer discovery via mDNS (`_attic._tcp`) when on shared WiFi
- State hashing for efficient sync comparison over mesh (fits in 250-byte packets)

### Situational Awareness Map
- Unified position tracking: mesh nodes, resources, personnel
- Geofencing with point-in-polygon detection (safe_area, hazard, rally_point, exclusion)
- Enter/exit alerts on geofence boundary crossings
- Layer toggles for mesh nodes, resources, personnel, geofences
- MapLibre GL JS with OSM online tiles and PMTiles offline vector tiles
- One-click offline map downloads: 50 US states, 10 FEMA regions, territories, CONUS
- Auto-downloads go-pmtiles CLI and extracts street-level (z14) tiles from Protomaps planet build
- Auto-refresh every 10 seconds

### OpenTAKServer Integration
- Cursor-on-Target (CoT) XML parsing and generation
- Position Location Information (PLI) bridge: mesh nodes → TAK clients
- GeoChat messages → ICS activity log entries
- Incident declarations published as CoT alert events
- TCP listener with auto-reconnect and buffer management
- Docker Compose `tak` profile for one-command TAK server deployment

### AI Chat with RAG
- Streaming chat powered by local Ollama models (qwen2.5, llama3, etc.)
- Hybrid retrieval: dense vectors (768-dim cosine) + sparse vectors + knowledge graph
- RRF fusion ranking with source citations
- Intent classification: question, search, tool, incident_query, chat
- 10 AI tools with RBAC enforcement (viewer < operator < admin)

### Knowledge Ingestion
- Upload PDFs, text, HTML, CSV — extracted and chunked automatically
- Token-based chunking (1700 tokens, 150 overlap) with heading awareness
- Optional entity extraction into FalkorDB knowledge graph
- ZIM file support (Wikipedia, Wiktionary, etc.)

### Mesh Networking & WiFi
- Meshtastic integration via MQTT for off-grid communication
- AI-powered mesh traffic summaries
- WiFi AP with captive portal routing to The Attic AI
- WiFi QR code generation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | AdonisJS 7 (ESM TypeScript), Lucid ORM, VineJS validation |
| Frontend | React 19, Inertia.js v2, Tailwind CSS 4, Vite 7 |
| AI Inference | Ollama (local), nomic-embed-text, qwen2.5 |
| Vector Search | Qdrant (dense 768-dim + sparse, int8 quantization) |
| Knowledge Graph | FalkorDB (optional, config-gated) |
| Voice | whisper.cpp (Metal GPU on Apple Silicon), MediaRecorder API |
| TAK | OpenTAKServer, Cursor-on-Target XML |
| Sync | Yjs CRDT, .attic bundles, mDNS peer discovery |
| Job Queue | BullMQ via @rlanz/bull-queue |
| Database | MySQL 8.0 |
| Cache/Queue | Redis 7 |
| Python Sidecar | FastAPI, python-libzim, whisper.cpp |
| Containers | Docker Compose with profiles |

## Quick Start

### Install from Bundle (Recommended — No Git Required)

The easiest way to run The Attic AI. Only prerequisite: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1. Download the latest `attic-ai-vX.Y.Z-arm64.zip` from Releases
2. Unzip it
3. Double-click **`install.command`**

The installer loads all Docker images, sets up the database, detects your hardware, pulls the right AI models, and starts everything. When it's done, open **http://localhost:3333**.

To remove everything: double-click **`uninstall.command`**.

### Build the Bundle (For Distributors)

```bash
git clone https://github.com/sjonas50/nomad2.0.git
cd nomad2.0
./scripts/bundle.sh
```

This produces `dist/attic-ai-vX.Y.Z-arm64.zip` (~8-15 GB depending on models) containing:
- All Docker images (pre-built, no compilation needed)
- Pre-pulled Ollama models (embedding + chat)
- Production Docker Compose config
- One-click install/uninstall scripts

Copy the zip to a USB drive for air-gapped deployment.

### Developer Install

```bash
git clone https://github.com/sjonas50/nomad2.0.git
cd nomad2.0
cp .env.example .env
# Generate APP_KEY and add to .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

npm install --legacy-peer-deps

# Start infrastructure services
docker compose up -d

# Pull AI models
docker exec attic_ollama ollama pull nomic-embed-text
docker exec attic_ollama ollama pull qwen2.5:7b

# Migrate and start
node ace migration:run
node ace serve --hmr
```

Visit `http://localhost:3333` — the first-user setup flow creates your admin account.

## Development

```bash
node ace serve --hmr          # Dev server with HMR
node ace test                 # Run all 202 unit tests
npm run typecheck             # TypeScript check
npm run lint                  # ESLint
npm run format                # Prettier
```

## Docker Compose Profiles

| Profile | Services | RAM |
|---------|----------|-----|
| (default) | MySQL, Redis, Ollama, Qdrant | 8 GB |
| `--profile graph` | + FalkorDB | 12 GB |
| `--profile zim` | + Python sidecar | 10 GB |
| `--profile tak` | + OpenTAKServer | 12 GB |
| `--profile full` | + FalkorDB + sidecar + TAK | 16 GB |

## Hardware Tiers (M4 MacBook Pro Optimized)

| RAM | LLM Model | Whisper Model | Profile |
|-----|-----------|---------------|---------|
| 16 GB | qwen2.5:7b | base.en | full |
| 24 GB | qwen2.5:14b | small.en | full |
| 48 GB+ | qwen2.5:32b | small.en | full |

Apple Silicon Metal GPU acceleration is enabled by default for both Ollama and whisper.cpp.

## Project Structure

```
app/
├── controllers/     # 11 HTTP controllers
├── middleware/       # Auth, inertia, security
├── models/          # 19 Lucid ORM models
├── services/        # 30+ service classes
│   ├── ics_service.ts           # Incident lifecycle, AAR, context blocks
│   ├── voice_capture_service.ts # Transcription + extraction pipeline
│   ├── bundle_service.ts        # .attic sneakernet bundles + encryption
│   ├── sync_service.ts          # State hashing, peer tracking
│   ├── cot_service.ts           # CoT XML parse/generate
│   ├── geofence_service.ts      # Point-in-polygon, boundary alerts
│   └── position_service.ts      # Unified position tracking
├── tools/           # 10 AI tools (5 core + 5 ICS)
└── validators/

commands/
├── sync_export.ts   # node ace sync:export [--passphrase]
└── sync_import.ts   # node ace sync:import [--passphrase]

inertia/
├── layouts/         # App shell layout
├── pages/           # 9 React pages
│   ├── incidents.tsx         # ICS dashboard
│   ├── incident_detail.tsx   # Tabbed incident view
│   └── map.tsx               # Situational awareness map
├── components/
│   ├── voice_recorder.tsx    # Push-to-record audio capture
│   └── sync_status.tsx       # Peer discovery + bundle management
└── hooks/

database/
├── migrations/      # 21 migration files
└── seeders/         # ICS/BCP template seeder (9 templates)

sidecar/
├── main.py          # FastAPI: /health, /extract/zim, /extract/entities, /transcribe
├── extractors/
│   ├── zim.py       # ZIM article extraction
│   ├── entities.py  # Named entity extraction
│   └── whisper.py   # whisper.cpp transcription
└── Dockerfile       # Includes whisper.cpp build + ffmpeg

scripts/
├── bundle.sh               # Build distributable zip for end users
├── build_offline_bundle.sh # Legacy offline bundle builder
└── detect_hardware.sh      # JSON hardware profile + model recommendations

install.command              # macOS double-click installer (for end users)
uninstall.command            # macOS double-click uninstaller
docker-compose.prod.yml     # Production compose (pre-built images, no build:)

tests/
└── unit/            # 202 unit tests across 11 spec files
```

## API Endpoints

### Pages (Inertia)
| Route | Description |
|-------|-------------|
| `GET /` | Chat interface |
| `GET /knowledge` | Knowledge base management |
| `GET /library` | Content library browser |
| `GET /incidents` | ICS incident dashboard |
| `GET /incidents/:id` | Incident detail (tabbed) |
| `GET /map` | Situational awareness map |
| `GET /services` | Docker service management |
| `GET /mesh` | Mesh network message board |
| `GET /wifi` | WiFi AP configuration |
| `GET /admin` | Admin dashboard (admin only) |

### API (JSON)
| Route | Description |
|-------|-------------|
| `POST /api/chat` | Stream chat response (ndjson) |
| `POST /api/incidents` | Declare incident |
| `PATCH /api/incidents/:id/status` | Update incident status |
| `POST /api/incidents/:id/activity` | Log activity entry |
| `POST /api/incidents/:id/check-in` | Personnel check-in |
| `GET /api/incidents/:id/summary` | Incident summary |
| `GET /api/incidents/:id/aar` | After-action report data |
| `POST /api/voice/capture` | Record → transcribe → extract → log |
| `POST /api/voice/transcribe` | Transcribe only |
| `POST /api/voice/extract` | Extract structured data from text |
| `POST /api/sync/export` | Export .attic bundle |
| `POST /api/sync/import` | Import .attic bundle |
| `GET /api/sync/status` | Sync status + state hash |
| `GET /api/sync/peers` | Discover local peers |
| `GET /api/map/markers` | All position markers |
| `GET /api/map/geofences` | Active geofences |
| `POST /api/map/geofences` | Create geofence |
| `GET /api/map/regions` | List map regions with download status |
| `POST /api/map/extract` | Start offline map extraction |
| `GET /api/map/extract/:regionId` | Check extraction progress |
| `DELETE /api/map/regions/:regionId` | Delete downloaded region |
| `POST /api/map/tiles/upload` | Upload PMTiles file |
| `GET /api/map/tiles/:filename` | Serve PMTiles with Range Requests |
| `GET /health` | Health check |

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0–7 | Complete | Core platform (auth, chat, RAG, knowledge, mesh, WiFi, services, security) |
| 8 | Complete | ICS & BCP data model, playbooks, AI tools, communication trees |
| 9 | Complete | Voice capture, whisper.cpp transcription, structured extraction |
| 10 | Complete | Data sync, sneakernet bundles, peer discovery |
| 11 | Complete | Situational awareness map, geofencing, position tracking |
| 12 | Complete | OpenTAKServer integration, CoT bridge |
| 13 | Complete | Packaging, offline install, encrypted bundles, hardware auto-config |

## Environment Variables

See [`.env.example`](.env.example) for all options. Key additions for COOP features:

| Variable | Description |
|----------|-------------|
| `NODE_ID` | Unique identifier for this Attic instance (auto-generated) |
| `BUNDLE_DIR` | Directory for .attic sneakernet bundles |
| `TAK_COT_HOST` | OpenTAKServer CoT TCP host |
| `TAK_COT_PORT` | OpenTAKServer CoT TCP port (default: 8089) |
| `TAK_ENABLED` | Enable TAK integration |
| `WHISPER_MODEL` | Whisper model name (default: base.en) |
| `SIDECAR_URL` | Python sidecar URL |

## License

UNLICENSED — Private project.
