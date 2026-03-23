# The Attic AI

An AI-first, offline-capable knowledge platform built for edge deployments. Run local LLMs, ingest documents and ZIM archives, search with hybrid vector + graph retrieval, manage Docker services, and communicate over Meshtastic mesh networks — all from a single self-hosted web interface.

## Why

Traditional knowledge platforms require constant internet connectivity. The Attic AI is designed for air-gapped, field, and low-bandwidth environments — disaster response, remote education, off-grid research, mesh-connected communities — where local-first AI is a necessity, not a convenience.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  AdonisJS 7 + React 19 + Inertia.js                             │
│                                                                  │
│  Chat UI ──▶ AIChatOrchestrator ──▶ OllamaService (local LLM)  │
│              │  intent classify       │  async mutex             │
│              │  tool routing          │  model management        │
│              │  context assembly      │  streaming generation    │
│              │                        │                          │
│              ├──▶ RetrievalService    ├──▶ EmbeddingService      │
│              │    vector + graph RRF  │    nomic-embed-text      │
│              │                        │    768-dim batched        │
│              └──▶ ToolRegistry        └──▶ ChunkingService       │
│                   5 built-in tools         1700-token windows    │
│                   RBAC enforcement                               │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Ollama  │ │  Qdrant  │ │ FalkorDB │ │  Python Sidecar  │   │
│  │  :11434  │ │  :6333   │ │  :6380   │ │  FastAPI :8100   │   │
│  │ qwen2.5  │ │ 768d cos │ │  Cypher  │ │  ZIM extraction  │   │
│  │ nomic    │ │ + sparse │ │  graphs  │ │  entity extract  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│  ┌──────────┐ ┌──────────┐                                      │
│  │ MySQL 8  │ │ Redis 7  │                                      │
│  │  :3306   │ │  :6379   │                                      │
│  └──────────┘ └──────────┘                                      │
└──────────────────────────────────────────────────────────────────┘
```

## Features

### AI Chat with RAG
- Streaming chat powered by local Ollama models (qwen2.5, llama3, etc.)
- Hybrid retrieval: dense vectors (768-dim cosine) + sparse vectors + optional knowledge graph
- RRF fusion ranking with source citations
- Intent classification routes queries to search, tools, or conversation
- Per-user chat sessions with history

### Knowledge Ingestion
- Upload PDFs, text, HTML, CSV — extracted and chunked automatically
- Token-based chunking (1700 tokens, 150 overlap) with heading awareness
- Batch embedding via nomic-embed-text with `search_document:`/`search_query:` prefixes
- Optional entity extraction into FalkorDB knowledge graph via Python sidecar
- ZIM file support (Wikipedia, Wiktionary, etc.) via python-libzim

### Content Library
- Curated manifest of downloadable offline content (Wikipedia, OpenStreetMap, etc.)
- Bandwidth-throttled downloads with progress tracking and cancel support
- Auto-embed pipeline: download completion triggers RAG ingestion

### AI Tool System
- 5 built-in tools: `search_knowledge_base`, `install_service`, `download_content`, `system_diagnostics`, `manage_model`
- RBAC enforcement (viewer < operator < admin)
- Parameter validation and confirmation gates for destructive actions
- LLM-powered natural language to tool call extraction

### Docker Service Management
- Start/stop/restart containers from the web UI
- Container logs viewer with demuxed stdout/stderr
- Health status monitoring

### Mesh Networking
- Meshtastic integration via MQTT for off-grid communication
- Packet processing: text messages, position updates, telemetry, node info
- Prompt injection sanitization on mesh messages before embedding
- AI-powered traffic summaries (per-channel or global)
- Auto-embed mesh messages into RAG pipeline

### WiFi Access Point
- hostapd/dnsmasq configuration for creating a local WiFi hotspot
- Captive portal routing to The Attic AI chat interface
- WiFi QR code generation for easy client connection

### Auth & RBAC
- Session-based authentication with scrypt password hashing
- Three roles: viewer (read-only), operator (actions), admin (full control)
- First-user setup flow

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | AdonisJS 7 (ESM TypeScript), Lucid ORM, VineJS validation |
| Frontend | React 19, Inertia.js v2, Tailwind CSS 4, Vite 7 |
| AI Inference | Ollama (local), nomic-embed-text, qwen2.5 |
| Vector Search | Qdrant (dense 768-dim + sparse, int8 quantization) |
| Knowledge Graph | FalkorDB (optional, config-gated) |
| Job Queue | BullMQ via @rlanz/bull-queue |
| Database | MySQL 8.0 |
| Cache/Queue | Redis 7 |
| Python Sidecar | FastAPI, python-libzim, GraphRAG-SDK |
| Containers | Docker Compose with profiles |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- npm

### 1. Clone and install

```bash
git clone https://github.com/sjonas50/nomad2.0.git
cd nomad2.0
cp .env.example .env
# Generate an APP_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add the output to APP_KEY in .env

npm install --legacy-peer-deps
```

### 2. Start infrastructure

```bash
# Core services (MySQL, Redis, Ollama, Qdrant)
docker compose up -d

# Full stack (adds FalkorDB + Python sidecar)
docker compose --profile full up -d
```

### 3. Pull required models

```bash
docker exec attic_ollama ollama pull qwen2.5:1.5b
docker exec attic_ollama ollama pull nomic-embed-text
```

### 4. Run migrations and start

```bash
node ace migration:run
node ace serve --hmr
```

Visit `http://localhost:3333` — the first-user setup flow will create your admin account.

## Development

```bash
# Dev server with HMR
node ace serve --hmr

# Run tests (86 unit tests)
node ace test

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## Docker Compose Profiles

| Profile | Services | RAM Required |
|---------|----------|-------------|
| (default) | MySQL, Redis, Ollama, Qdrant | 8 GB |
| `--profile graph` | + FalkorDB | 12 GB |
| `--profile zim` | + Python sidecar | 10 GB |
| `--profile full` | + FalkorDB + Python sidecar | 16 GB |

## Project Structure

```
app/
├── controllers/     # 8 HTTP controllers
├── middleware/       # Auth, inertia, security
├── models/          # 13 Lucid ORM models
├── services/        # 23 service classes (AI, ingestion, mesh, etc.)
├── tools/           # 5 built-in AI tools
└── validators/      # VineJS request validators

inertia/
├── layouts/         # App shell layout
├── pages/           # 6 React pages (chat, knowledge, library, services, mesh, wifi)
├── components/      # Chat components (message bubble, input, sidebar)
└── hooks/           # useChat streaming hook

database/
└── migrations/      # 13 migration files

sidecar/             # Python FastAPI service
├── main.py
├── extractors/      # ZIM + entity extractors
└── pyproject.toml

tests/
└── unit/            # 86 unit tests across 7 spec files

docs/
├── research.md      # Technology evaluation
├── architecture.md  # System architecture + data flow diagrams
└── build-plan.md    # 8-phase build plan
```

## Environment Variables

See [`.env.example`](.env.example) for all configuration options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_KEY` | Yes | Encryption key (32-byte hex) |
| `DB_*` | Yes | MySQL connection |
| `REDIS_HOST` | Yes | Redis for BullMQ |
| `OLLAMA_HOST` | No | Ollama API URL (default: `http://127.0.0.1:11434`) |
| `QDRANT_HOST` | No | Qdrant URL (default: `http://127.0.0.1:6333`) |
| `FALKORDB_ENABLED` | No | Enable knowledge graph (default: `false`) |
| `MESH_ENABLED` | No | Enable Meshtastic integration (default: `false`) |
| `MQTT_BROKER` | No | MQTT broker for mesh messages |
| `ZIM_STORAGE_DIR` | No | Directory for ZIM file storage |
| `MAP_STORAGE_DIR` | No | Directory for PMTiles map storage |

## Hardware Tiers

| Tier | RAM | What Works |
|------|-----|-----------|
| Minimum | 8 GB | Chat + vector RAG, 1.5-3B models |
| Recommended | 16 GB | Full hybrid RAG with knowledge graph, 7-8B models |
| Power | 32 GB+ | Multi-model orchestration, 13B+ models |

## API Endpoints

### Pages (Inertia)
| Route | Description |
|-------|-------------|
| `GET /` | Chat interface |
| `GET /knowledge` | Knowledge base management |
| `GET /library` | Content library browser |
| `GET /services` | Docker service management |
| `GET /mesh` | Mesh network message board |
| `GET /wifi` | WiFi AP configuration |

### API (JSON)
| Route | Description |
|-------|-------------|
| `POST /api/chat` | Stream chat response (ndjson) |
| `GET /api/sessions` | List chat sessions |
| `POST /api/knowledge/upload` | Upload document |
| `POST /api/library/download` | Start content download |
| `POST /api/services/:id/start` | Start Docker container |
| `GET /api/mesh/messages` | Get mesh messages |
| `GET /api/mesh/summary` | AI summary of mesh traffic |
| `POST /api/wifi/start` | Start WiFi AP |
| `GET /api/health` | Health check |

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | Complete | Scaffold, Docker Compose, auth, streaming POC |
| 1 | Complete | AI chat, RAG pipeline, chat UI |
| 2 | Complete | Knowledge ingestion, graph RAG, Python sidecar |
| 3 | Complete | Content services, ZIM, maps, Docker management |
| 4 | Complete | Tool registry, AI workflows, onboarding |
| 5 | Complete | WiFi AP, mesh networking, communication |
| 6 | Planned | Security hardening, audit logging, quality metrics |
| 7 | Planned | Install scripts, performance, migration tooling |

## License

UNLICENSED — Private project.
