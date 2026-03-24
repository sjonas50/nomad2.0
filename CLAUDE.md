# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Always use the latest anthropic models for all ai services.

## Project Overview

**The Attic AI** — an AI-first offline knowledge platform. Ground-up rebuild where the AI conversation interface is the primary surface. All inference runs locally via Ollama. Designed for edge hardware (8GB-64GB RAM), air-gapped environments.

## Build & Development Commands

```bash
# Development
node ace serve --watch                    # Start dev server with HMR
npm run dev                               # Alternative dev start

# Testing
node ace test                             # Run all tests
node ace test --tags=ai-core              # AI core tests only
node ace test --tags=integration:chat     # Chat integration tests
node ace test --files="tests/unit/chunking_service.spec.ts"  # Single test file

# Database
node ace migration:run                    # Run migrations
node ace migration:rollback               # Rollback last batch
node ace db:seed                          # Seed defaults (model roles, prompt templates)

# Linting & Formatting
npx ruff check .                          # Lint Python sidecar
npx ruff format .                         # Format Python sidecar

# Docker
docker compose up -d                      # Start core services (MySQL, Redis, Ollama, Qdrant)
docker compose --profile full up -d       # Start all services (+ FalkorDB, Python sidecar)
docker compose logs -f admin              # Follow app logs

# Queue workers
node ace queue:listen                     # Start BullMQ workers

# Benchmarks
node ace benchmark                        # Run performance benchmarks
```

## Tech Stack

- **Backend:** AdonisJS 6 (ESM TypeScript), Lucid ORM, VineJS validation
- **Frontend:** React 19 + Inertia.js v2 + TanStack Query v5 + Tailwind CSS 4
- **Database:** MySQL 8.0, Redis 7.x (BullMQ, port 6379)
- **AI:** Ollama (local inference), Qdrant 1.16 (vector search, 768-dim + BM42 sparse), FalkorDB 4.16 (knowledge graph, port 6380)
- **Embedding:** nomic-embed-text v1.5 — always use `search_document:` prefix for ingestion, `search_query:` prefix for queries
- **Python sidecar:** FastAPI (port 8100) — ZIM extraction (python-libzim), entity extraction (GraphRAG-SDK)
- **Build:** Vite 6, Docker Compose with profiles

## Architecture

Detailed diagrams: `docs/architecture.md`. Build plan: `docs/build-plan.md`. Research: `docs/research.md`.
COOP extension: `docs/architecture-coop.md`. COOP build plan: `docs/build-plan-coop.md`. COOP research: `docs/research-coop-features.md`.

### Service Layer (7 decomposed RAG services + orchestrator)

| Service | Responsibility |
|---|---|
| `AIChatOrchestrator` | Central request router: intent → retrieve → generate → persist |
| `OllamaService` | Ollama client wrapper with async mutex (prevents model swap thrashing on CPU) |
| `VectorStoreService` | Qdrant CRUD, collection with dense + sparse vectors, payload indexes |
| `EmbeddingService` | Batch embedding, 1800-token ceiling, `search_document:` prefix |
| `ChunkingService` | Token-based + structured/heading-aware chunking via @chonkiejs/core |
| `RetrievalService` | Hybrid retrieval: vector + graph + RRF fusion, reranking |
| `QueryProcessingService` | Query rewriting, expansion, multi-query generation |
| `IngestionService` | BullMQ FlowProducer pipeline: Extract→Chunk→Embed→EntityExtract |
| `ContentExtractorService` | PDF (unpdf), OCR (tesseract.js), text, HTML extraction |
| `GraphService` | FalkorDB Cypher queries, config-gated behind `FALKORDB_ENABLED` |

### Key Patterns

- **Chat at `/`** — root route for authenticated users
- **LLM streaming bypasses Inertia.js** — uses `fetch` + `ReadableStream` directly from React `useChat` hook. Inertia is for page navigation only.
- **FalkorDB is config-gated** — only enabled on 16GB+ devices via `FALKORDB_ENABLED` env var. Separate Redis container on port 6380.
- **Ollama request serialization** — async mutex in OllamaService prevents concurrent model swaps on CPU hardware. Embedding model pinned with `keep_alive: -1`.
- **BullMQ FlowProducer** — ingestion pipeline uses parent/child jobs (Extract→Chunk→Embed). No BullMQ Pro dependency.
- **Python sidecar for ecosystem gaps** — ZIM extraction (no Node.js parser) and entity extraction (GraphRAG-SDK is Python-only).

## Critical Pitfalls

- **nomic-embed-text crashes above 2048 tokens** — enforce 1800-token ceiling in ChunkingService
- **Qdrant sparse vectors must be declared at collection creation** — cannot add BM42 later without destroying collection
- **Redis `maxmemory-policy` must be `noeviction`** — any other policy silently drops BullMQ jobs. Validate on startup.
- **Lucid ORM `updateOrCreate` breaks on JSON columns** — use `find + merge + save` pattern instead
- **FalkorDB cannot share Redis with BullMQ** — must run separate container
- **Inertia navigation kills SSE streams** — chat streaming must bypass Inertia entirely
- **Ollama `OLLAMA_NUM_PARALLEL=1`** is default on CPU — one request at a time, all others queue FIFO

## Data Models

- `users` — session auth, RBAC (viewer/operator/admin)
- `chat_sessions` / `chat_messages` — per-user with `user_id` FK, sources JSON, metadata JSON
- `model_roles` — configurable model assignments per AI role (embedder, classifier, rewriter, generator)
- `knowledge_sources` — lifecycle tracking: pending→extracting→chunking→embedding→indexed→failed
- `prompt_templates` — versioned system prompts in DB (not hardcoded)
- `tool_definitions` — AI-invokable capabilities with RBAC requirements
- `mesh_nodes` / `mesh_messages` — Meshtastic mesh network state
- `audit_logs` — pattern-matched route logging for security auditing
- `retrieval_feedback` — per-message thumbs up/down for RAG quality tracking

### COOP Models (Phase 8+)

- `incidents` — ICS incident container with type, status, operational period
- `essential_functions` — FEMA priority-tiered functions with personnel assignments
- `resources` — equipment/supplies with geo-location and assignment tracking
- `activity_logs` — append-only ICS-214 style log (corrections via `corrects_id` self-ref, never UPDATE)
- `personnel_statuses` — per-incident check-in with location and status
- `geofences` — GeoJSON polygon zones for enter/exit alerts

## Qdrant Collection: `attic_knowledge_base`

- Dense vectors: 768-dim, cosine, scalar quantization (int8)
- Sparse vectors: BM42 (declared at creation, even if unused initially)
- Indexed payload fields: `source`, `content_type`, `source_id`, `language`, `created_at`, `quality_score`

## Docker Compose Services

| Service | Port | Profile | Notes |
|---|---|---|---|
| admin (AdonisJS) | 3333 | default | Main app |
| mysql | 3306 | default | `innodb_buffer_pool_size=256M` on constrained devices |
| redis | 6379 | default | BullMQ. `noeviction` mandatory |
| ollama | 11434 | default | Mandatory for AI |
| qdrant | 6333 | default | Mandatory for RAG |
| falkordb | 6380 | full/graph | Config-gated, 16GB+ RAM only |
| sidecar | 8100 | full/zim | Python FastAPI (ZIM + entity extraction + whisper.cpp) |
| opentakserver | 8089/8443/8080 | tak | TAK CoT bridge for ATAK/iTAK interop |
| y-websocket | 4444 | sync | Yjs CRDT sync server for multi-node replication |

### COOP-Specific Patterns

- **ICS activity logs are append-only** — corrections are new rows with `corrects_id` FK, never UPDATEs. This is a schema constraint for crisis data integrity.
- **Yjs CRDT sync runs as separate Node.js process** — NOT colocated with AdonisJS. Mixing y-websocket with AdonisJS WebSocket handling causes message routing conflicts.
- **whisper.cpp runs inside the Python sidecar container** — avoids audio device Docker plumbing. Use `WHISPER_MODEL` env var (default `base.en` on M4 MacBook Pro, `small.en` on 24GB+).
- **Target hardware is M4 MacBook Pro** — 16GB+ unified memory, Apple Silicon Metal GPU. All services run simultaneously. `full` Docker Compose profile is always viable. No Pi/embedded constraints.
- **OpenTAKServer CoT parsing** — only implement standard CoT types: `a-f-G-U-C` (PLI) and `b-t-f` (GeoChat). Vendor extensions break parsers.
- **Meshtastic sync bandwidth** — 250-byte payload per packet. Sync only delta hashes and text summaries over mesh. Full Yjs sync waits for WiFi.
- **npm install requires `--legacy-peer-deps`** — `@rlanz/bull-queue@3.1.0` peers on `@adonisjs/core@^6`
