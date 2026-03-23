# The Attic AI — System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Docker Compose Host                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    attic_admin (AdonisJS 6)                     │    │
│  │                                                                 │    │
│  │  ┌──────────┐  ┌──────────────────┐  ┌────────────────────┐   │    │
│  │  │ Inertia  │  │ AIChatOrchestrator│  │   BullMQ Workers   │   │    │
│  │  │ React 19 │  │                  │  │  ┌──────────────┐  │   │    │
│  │  │ Pages    │  │  Intent Router   │  │  │ EmbedFileJob │  │   │    │
│  │  │          │  │  Context Manager │  │  │ ExtractJob   │  │   │    │
│  │  │ Chat UI  │──│  Model Selector  │  │  │ GraphBuildJob│  │   │    │
│  │  │(streams  │  │  Tool Executor   │  │  └──────────────┘  │   │    │
│  │  │ via      │  └────┬───┬───┬─────┘  └─────────┬──────────┘   │    │
│  │  │ fetch)   │       │   │   │                   │              │    │
│  │  └──────────┘       │   │   │                   │              │    │
│  │                     │   │   │                   │              │    │
│  │  ┌─────────────────────────────────────────────────────────┐  │    │
│  │  │                   Service Layer                          │  │    │
│  │  │                                                         │  │    │
│  │  │  OllamaService      VectorStoreService   GraphService  │  │    │
│  │  │  EmbeddingService   RetrievalService     IngestionSvc  │  │    │
│  │  │  ChunkingService    QueryProcessingSvc   ContentExtSvc │  │    │
│  │  └──────┬──────────────────┬──────────────────┬───────────┘  │    │
│  └─────────┼──────────────────┼──────────────────┼───────────────┘    │
│            │                  │                  │                     │
│  ┌─────────▼──────┐ ┌────────▼───────┐ ┌───────▼────────┐           │
│  │    Ollama       │ │    Qdrant      │ │  FalkorDB      │           │
│  │  :11434         │ │  :6333         │ │  :6380         │           │
│  │                 │ │                │ │  (Redis module) │           │
│  │ nomic-embed-text│ │ attic_kb       │ │ attic_knowledge│           │
│  │ qwen2.5:1.5b   │ │ 768d + sparse  │ │ Cypher graphs  │           │
│  │ llama3.x:Xb    │ │ cosine + BM42  │ │                │           │
│  └────────────────┘ └────────────────┘ └────────────────┘           │
│                                                                      │
│  ┌────────────────┐ ┌────────────────┐ ┌─────────────────────────┐  │
│  │    MySQL 8.0    │ │  Redis :6379   │ │  attic_sidecar (Python) │  │
│  │  :3306          │ │  BullMQ queues │ │  FastAPI :8100           │  │
│  │                 │ │  noeviction    │ │                         │  │
│  │ users, sessions │ │                │ │  python-libzim (ZIM)    │  │
│  │ chat_messages   │ │                │ │  graphrag_sdk (entities)│  │
│  │ knowledge_srcs  │ │                │ │  Ollama client          │  │
│  │ model_roles     │ │                │ │                         │  │
│  └────────────────┘ └────────────────┘ └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. AIChatOrchestrator (`app/services/ai_chat_orchestrator.ts`)

Central request router. Every user message flows through:

| Step | Action | Service Called |
|------|--------|--------------|
| 1 | Sanitize + parse input | Built-in |
| 2 | Classify intent (question/command/search/chat) | OllamaService (classifier model) |
| 3 | Load conversation history (last N turns) | ChatSession/ChatMessage models |
| 4 | If question/search: retrieve context | RetrievalService |
| 5 | If command: resolve + execute tool | ToolRegistry |
| 6 | Select generation model | ModelRoleService |
| 7 | Assemble system prompt + context | PromptTemplateService |
| 8 | Stream response via ReadableStream | OllamaService (generator model) |
| 9 | Persist messages + metadata | ChatMessage model |

**Inputs:** HTTP request with user message, session ID, user context
**Outputs:** ReadableStream (ndjson) with tokens, thinking blocks, citations, tool results

### 2. OllamaService (`app/services/ollama_service.ts`)

Wraps the official `ollama` npm client. Manages model lifecycle and request serialization.

- **Async mutex** for request serialization on CPU hardware (prevents model swap thrashing)
- `keep_alive: -1` on embedding model to pin in memory
- Model management: pull, list, show (for `num_ctx` discovery), delete
- Streaming: returns `AsyncGenerator` for chat, non-streaming for embed

### 3. VectorStoreService (`app/services/vector_store_service.ts`)

Wraps `@qdrant/js-client-rest`. Manages the `attic_knowledge_base` collection.

- Collection creation with **both dense (768-dim cosine) and sparse (BM42) vectors** declared upfront
- Scalar quantization enabled from day one
- Payload index creation at setup time (source, content_type, source_id, language, created_at, quality_score)
- Batch upsert (500 points/batch)
- Search with filtering and sparse+dense hybrid via Qdrant Query API

### 4. GraphService (`app/services/graph_service.ts`)

Wraps `falkordb` npm client. Manages the `attic_knowledge` graph in FalkorDB.

- **Config-gated**: only enabled on 16GB+ devices via `FALKORDB_ENABLED` env var
- Entity lookup, neighbor expansion, path queries via typed Cypher wrappers
- Graph schema creation (entity types, relationship types, indexes)
- Connection to FalkorDB Redis on port 6380 (separate from BullMQ Redis on 6379)

### 5. RetrievalService (`app/services/retrieval_service.ts`)

Hybrid retrieval pipeline: Vector + Graph + RRF fusion.

```
Query → QueryProcessingService (rewrite + expand)
  ├── VectorStoreService.search() → top-40 dense+sparse candidates
  ├── GraphService.queryRelated() → graph-connected chunks (if enabled)
  └── RRF fusion → deduplicate → top-5 reranked results
      → Format with citation IDs → return context blocks
```

### 6. IngestionService (`app/services/ingestion_service.ts`)

Orchestrates the content pipeline via BullMQ FlowProducer:

```
Extract (parent job)
  ├── Chunk (child job)
  │   ├── Embed → Qdrant (child job)
  │   └── EntityExtract → FalkorDB (child job, via Python sidecar)
  └── Update knowledge_sources lifecycle status at each step
```

### 7. Python Sidecar (`sidecar/`)

FastAPI service handling Python-ecosystem tasks:

| Endpoint | Purpose |
|----------|---------|
| `POST /extract/zim` | Extract articles from ZIM files via python-libzim |
| `POST /extract/entities` | Entity extraction via GraphRAG-SDK + Ollama |
| `GET /health` | Health check |

Communicates with Ollama directly for entity extraction. Returns structured JSON to AdonisJS.

### 8. Frontend Architecture

```
React 19 + Inertia.js (page navigation)
  │
  ├── Inertia Pages (standard nav)
  │   ├── /login, /setup (auth)
  │   ├── /library (content browsing)
  │   ├── /maps, /mesh, /admin
  │   └── / (chat — primary surface)
  │
  └── Chat Component (bypasses Inertia for streaming)
      ├── Custom useChat hook (~100 lines)
      │   └── fetch() + ReadableStream to AdonisJS /api/chat endpoint
      ├── shadcn/ui AI components (copy-paste, no npm dep)
      │   ├── Message list with markdown + citations
      │   ├── Thinking blocks
      │   └── Tool execution cards
      ├── Left sidebar: session list (TanStack Query)
      └── Right sidebar: citations + sources (collapsible)
```

**Critical constraint:** LLM streaming uses `fetch` + `ReadableStream` directly, NOT Inertia.js data layer. Inertia navigation events would kill in-flight streams.

## Data Flow: Chat Request

```
Browser                AdonisJS              Ollama          Qdrant       FalkorDB
  │                      │                     │               │             │
  │── POST /api/chat ──▶│                     │               │             │
  │                      │── classify intent ─▶│               │             │
  │                      │◀── {question} ─────│               │             │
  │                      │                     │               │             │
  │                      │── embed query ─────▶│               │             │
  │                      │◀── [768-dim vec] ──│               │             │
  │                      │                     │               │             │
  │                      │── hybrid search ───────────────────▶│             │
  │                      │◀── top-40 candidates ──────────────│             │
  │                      │                     │               │             │
  │                      │── graph traverse ──────────────────────────────▶│
  │                      │◀── related entities ───────────────────────────│
  │                      │                     │               │             │
  │                      │   [RRF rerank → top-5]              │             │
  │                      │                     │               │             │
  │                      │── generate (stream)▶│               │             │
  │◀── ReadableStream ──│◀── ndjson tokens ──│               │             │
  │    (token by token)  │                     │               │             │
  │                      │── persist msg ─────▶ MySQL          │             │
```

## Data Flow: Content Ingestion

```
Upload/Download          BullMQ              Services           External
     │                     │                    │                  │
     │── file arrives ────▶│                    │                  │
     │                     │── ExtractJob ─────▶│                  │
     │                     │                    │── ContentExtractor│
     │                     │                    │   (unpdf/tesseract)
     │                     │                    │                  │
     │                     │   IF ZIM FILE:     │                  │
     │                     │── via HTTP ────────────────────────▶ Python sidecar
     │                     │◀── articles JSON ◀────────────────── (python-libzim)
     │                     │                    │                  │
     │                     │── ChunkJob ───────▶│                  │
     │                     │                    │── ChunkingService│
     │                     │                    │   (@chonkiejs)   │
     │                     │                    │                  │
     │                     │── EmbedJob ───────▶│                  │
     │                     │                    │── EmbeddingService│
     │                     │                    │   → Ollama embed │
     │                     │                    │   → Qdrant upsert│
     │                     │                    │                  │
     │                     │── EntityJob ──────▶│                  │
     │                     │                    │── via HTTP ─────▶ Python sidecar
     │                     │                    │   (GraphRAG-SDK) │ (entity extraction)
     │                     │                    │── GraphService   │
     │                     │                    │   → FalkorDB     │
     │                     │                    │     MERGE        │
```

## External Dependencies

| Dependency | Auth Method | Offline? | Failure Mode |
|---|---|---|---|
| Ollama | None (localhost only) | Yes | Show "AI setup required" state |
| Qdrant | API key (optional, internal network) | Yes | Degrade to no-RAG chat |
| FalkorDB | None (internal network) | Yes | Degrade to vector-only retrieval |
| MySQL | User/password | Yes | App won't start (hard dep) |
| Redis (BullMQ) | Password (optional) | Yes | No background jobs |
| Redis (FalkorDB) | None (internal) | Yes | No graph queries |
| Python sidecar | None (internal HTTP) | Yes | No ZIM extraction, no entity extraction |

## Environment Variables

```bash
# Core
NODE_ENV=production
HOST=0.0.0.0
PORT=3333
APP_KEY=<generated>

# Database
DB_HOST=mysql
DB_PORT=3306
DB_USER=attic
DB_PASSWORD=<secret>
DB_DATABASE=attic

# Redis (BullMQ)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<optional>

# Ollama
OLLAMA_HOST=http://ollama:11434
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1

# Qdrant
QDRANT_HOST=http://qdrant:6333
QDRANT_API_KEY=<optional>
QDRANT_COLLECTION=attic_knowledge_base

# FalkorDB (config-gated)
FALKORDB_ENABLED=true
FALKORDB_HOST=falkordb
FALKORDB_PORT=6380
FALKORDB_GRAPH=attic_knowledge

# Python Sidecar
SIDECAR_URL=http://sidecar:8100

# Feature flags
GRAPH_RAG_ENABLED=true   # requires FALKORDB_ENABLED + 16GB RAM
```

## Scaling Considerations

### Hardware Tiers

| Tier | RAM | Services Enabled | Model Size |
|------|-----|-----------------|------------|
| Minimum (8GB) | Ollama + Qdrant + MySQL + Redis | Vector RAG only, no FalkorDB | 1.5-3B |
| Recommended (16GB) | + FalkorDB + Python sidecar | Full hybrid RAG | 7-8B |
| Power (32GB+) | All + multiple models loaded | Multi-model orchestration | 13B+ |

### Bottlenecks

1. **Ollama inference** — single-threaded on CPU. Cannot parallelize embedding + generation. Mitigated by async mutex + priority queue (user queries > background embedding).
2. **Embedding throughput** — ~100 chunks/min on CPU. Large ZIM files (100K+ articles) take hours. Run overnight via BullMQ scheduled jobs.
3. **Qdrant memory** — 100K 768-dim vectors = ~300MB (float32) or ~75MB (int8 quantized). Scale via on-disk storage for constrained devices.
4. **FalkorDB memory** — 1-2GB for small graphs. Not viable on 8GB devices.

### Docker Compose Profiles

Use Docker Compose profiles to enable/disable services by hardware tier:

```yaml
services:
  falkordb:
    profiles: ["full", "graph"]  # only starts with --profile full
  sidecar:
    profiles: ["full", "zim"]    # only starts with --profile full or --profile zim
```
