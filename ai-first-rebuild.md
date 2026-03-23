# The Attic AI: Build From Scratch as AI-First

## Complete Rebuild Blueprint

---

## 1. Vision and Philosophy

### Current Approach: Knowledge Appliance with AI Bolted On

The current system was designed as an offline knowledge and content management platform. The home page is a grid of service tiles — Kiwix, CyberChef, FlatNotes, Kolibri, Maps, Mesh, Settings. The AI chat is one tile among many, accessible via Ollama if installed. The RAG pipeline was added after the core platform existed.

Evidence of the bolt-on pattern:
- `ChatsController` checks if Ollama is installed and redirects to `/settings` if not — the AI is optional
- `AppLayout` conditionally renders `ChatButton` only if Ollama is detected
- RAG context injection happens inside `OllamaController.chat()` at request time — a feature of the chat endpoint, not a core system capability
- Chat sessions (`ChatSession` model) have no user association — they are global, not per-user

### AI-First Approach: The AI IS the Interface

An AI-first rebuild inverts the architecture:

1. **Chat is the primary surface.** The landing page after login is the AI conversation interface. All other capabilities are reachable from the chat or secondary navigation, but conversation is always front-and-center.

2. **The knowledge base is the foundational data layer.** Everything that enters the system — ZIM files, uploaded documents, mesh messages, map metadata, user notes — flows through the embedding pipeline first. Content is not "stored then optionally embedded"; it is "ingested into the knowledge graph, then surfaced through various views."

3. **AI orchestrates workflows.** Instead of dedicated wizard pages (Easy Setup, Scenario Packs), the AI guides users through setup, recommends content, summarizes mesh traffic, and helps troubleshoot.

4. **Multi-model orchestration is architecture, not optimization.** The current system uses one model for chat, one for query rewriting (`qwen2.5:3b`), and one for title generation. An AI-first design formalizes this into a model router with explicit roles.

5. **Retrieval quality drives design decisions.** Chunking strategy, embedding model choice, reranking, and context injection are first-class configurable subsystems with quality metrics.

### What Stays the Same

- Offline-first, air-gapped operation remains the core constraint
- AdonisJS 6 + React 19 + Inertia.js stack
- Docker Compose infrastructure pattern
- MySQL + Redis for structured data and job queues
- Ollama for local LLM inference, Qdrant for vector search
- Session auth with RBAC (viewer/operator/admin)
- The same content sources: ZIM, PMTiles, scenario packs

### What Changes Fundamentally

- The application entry point and navigation model
- How content ingestion relates to the knowledge base
- The chat/RAG pipeline moves from a service to the core architecture
- Multi-model orchestration with explicit routing
- Per-user chat sessions and knowledge context
- AI-assisted onboarding replacing static wizards
- Embedding pipeline becomes event-driven, not batch-job-driven
- Quality metrics and observability for retrieval accuracy

---

## 2. Architecture Overview

### Current Architecture (Content-Centric)

```
User -> Home Grid -> [Kiwix | Maps | Chat | Mesh | Settings | ...]
                         |
                    (if Ollama installed)
                         |
                   Chat Interface
                         |
              OllamaController.chat()
                    /          \
          Query Rewrite      RAG Search
          (qwen2.5:3b)      (Qdrant)
                    \          /
              Context Injection -> LLM -> Stream Response
```

### AI-First Architecture (Conversation-Centric)

```
User -> Login -> AI Conversation Interface (primary)
                         |
                  AI Orchestration Layer
                  /       |       \        \
          Router      Knowledge    Tool      Context
          Model       Pipeline    Registry   Manager
           |              |          |          |
      Intent       Qdrant +      [Browse     Per-user
      Classify     Embedding     Content,    history +
      + Route      Pipeline      Maps,       preferences
           |              |      Mesh,           |
      Model          Multi-     Settings,    Adaptive
      Selector       source     System       context
           |         Ingest     Control]     window
           |              |          |          |
      Generation     ZIM, Docs,  Structured    |
      Model          Uploads,    Function      |
      (adaptive)     Notes,      Calls         |
                     Mesh msgs                 |
                          \        |          /
                           Unified Response
                                |
                    [Secondary Navigation]
                    Content | Maps | Mesh | Admin
```

### Key Architectural Shifts

**1. AI Orchestration Layer (new)**
A request router between user input and all backend capabilities. Every user message passes through:
- Intent classification (question, command, search, small talk?)
- Knowledge retrieval (always runs, with relevance gating)
- Tool selection (does this require browsing content, changing settings, querying maps?)
- Response generation (which model, how much context, what format?)

**2. Knowledge Pipeline as Event Bus (redesigned)**
Currently: File upload -> BullMQ job -> embed -> Qdrant (fire-and-forget)
AI-First: Content ingestion emits events. Embedding is one subscriber. Metadata extraction is another. Search index updates are another. Quality validation is another.

**3. Unified Context Manager (new)**
A dedicated context manager that:
- Maintains per-user conversation history
- Tracks which knowledge sources were used and rated
- Adapts context window based on model capacity AND user feedback
- Provides citation tracking so responses can reference specific sources

---

## 3. Technology Stack

### Keep (Same Technology, Same Role)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Backend Framework | AdonisJS 6 (ESM TypeScript) | Mature, DI support, Lucid ORM, team expertise |
| Frontend Framework | React 19 + Inertia.js v2 | SSR-optional, shared types, existing patterns |
| State Management | TanStack Query v5 | Cache, refetch, mutations |
| Database | MySQL 8.0 via Lucid ORM | Structured data, migrations, audit logs |
| Job Queue | BullMQ (Redis) | Priority queues, progress tracking |
| Real-time | @adonisjs/transmit (SSE) | Low overhead, no WebSocket complexity |
| LLM Runtime | Ollama | Local inference, model management, streaming |
| Vector DB | Qdrant | JS client, filtering, payload indexes |
| Embedding Model | nomic-embed-text v1.5 (768-dim) | Task prefixes, good quality/size ratio |
| CSS | Tailwind CSS 4 | Component-based styling, theme tokens |
| Validation | VineJS | Type-safe, declarative, AdonisJS native |
| Build | Vite 6 | Fast, HMR, React plugin |

### Upgrade (Same Technology, Enhanced Role)

| Component | Current | AI-First Change |
|-----------|---------|-----------------|
| Chunking | @chonkiejs/core (char-based) | Add semantic chunking via heading-aware splitting; extract `ZIMExtractionService.extractStructuredContent` into a generic `StructuredChunker` |
| Chat Sessions | Global (no user FK) | Per-user with `user_id` FK, conversation metadata, feedback tracking |
| KV Store | Flat key-value | Add namespacing for AI config (model preferences, RAG tuning, prompt templates) |
| Query Rewriting | Single hardcoded model (`qwen2.5:3b`) | Configurable per-deployment; fallback chain |
| Context Limits | Static tiers in `RAG_CONTEXT_LIMITS` | Dynamic based on actual model context window (query Ollama `show` endpoint for `num_ctx`) |

### Add (New Components)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Model Router | Custom TypeScript service | Classify intent, select model, manage fallbacks |
| Tool Registry | Custom TypeScript service | Register capabilities that AI can invoke |
| Embedding Pipeline Bus | BullMQ + Redis Pub/Sub | Event-driven ingestion with multiple subscribers |
| Retrieval Quality Metrics | Custom + MySQL table | Track retrieval accuracy, user feedback, citation usage |
| Prompt Template Engine | Handlebars or custom | Versioned system prompts with variable injection |

### Remove / Replace

| Current | Replacement | Rationale |
|---------|------------|-----------|
| Static Easy Setup wizard pages | AI-guided onboarding conversation | AI walks users through setup |
| Hardcoded `SYSTEM_PROMPTS` object | Prompt template table in MySQL | Versioned, editable, A/B testable |
| `QUERY_EXPANSION_DICTIONARY` (static acronym map) | Dynamic expansion via small model + cached lookups | More flexible |

---

## 4. Core AI Pipeline

### 4.1 Request Flow (Detailed)

```
User Message
    |
    v
[1. Pre-processing]
    - Sanitize input
    - Extract @mentions, /commands, file references
    - Detect language (for multilingual ZIM content)
    |
    v
[2. Intent Classification] (small model: qwen2.5:1.5b or 3b)
    - Categories: question, command, search, conversation, system_action
    - Confidence score
    - If command: extract action + parameters
    - If < threshold: fall through to general conversation
    |
    v
[3. Context Assembly]
    - Load user's conversation history (last N turns, configurable)
    - If question/search: run retrieval pipeline (step 4)
    - If command: resolve tool (step 5)
    - If conversation: minimal context, skip retrieval
    |
    v
[4. Retrieval Pipeline] (when triggered)
    4a. Query Processing
        - Conversation-aware rewriting
        - Domain-specific expansion
        - Multi-query generation: 2-3 variant queries for broader recall
    4b. Embedding + Search
        - Embed processed query with search_query prefix
        - Qdrant search with source filtering
        - Keyword extraction for hybrid scoring
    4c. Reranking
        - Semantic + keyword hybrid scoring
        - Source diversity penalty
        - NEW: User feedback signal (demote poorly-rated sources)
        - NEW: Recency boost for time-sensitive content
    4d. Context Formatting
        - Adaptive context budget (query model metadata dynamically)
        - Citation injection with source IDs for traceability
        - Structured context blocks with metadata headers
    |
    v
[5. Tool Execution] (when triggered)
    - Tool registry lookup by intent
    - Parameter validation
    - Execute tool (install service, download content, configure WiFi, etc.)
    - Return structured result for AI to narrate
    |
    v
[6. Generation]
    - Model selection based on task complexity, hardware, user preference
    - System prompt assembly (base + context + tool results)
    - Streaming response with thinking support
    - Citation markers inline
    |
    v
[7. Post-processing]
    - Persist messages with metadata
    - Track which knowledge sources were cited
    - Update retrieval metrics
    - If first message: generate title
    - Emit events for downstream subscribers
```

### 4.2 Model Orchestration Strategy

| Role | Default Model | Purpose | Latency Target |
|------|--------------|---------|----------------|
| `embedder` | nomic-embed-text:v1.5 | Embedding generation | <100ms per chunk |
| `classifier` | qwen2.5:1.5b | Intent classification, routing | <500ms |
| `rewriter` | qwen2.5:3b | Query rewriting, title generation | <2s |
| `generator_small` | llama3.2:3b | Simple Q&A, tool narration | <3s first token |
| `generator_large` | (user's choice / largest available) | Complex reasoning, long-form | <5s first token |
| `summarizer` | qwen2.5:3b | Mesh message summaries, content digests | <3s |

These are stored in a `model_roles` table (not hardcoded constants) and are configurable. The system validates on startup that assigned models are installed and falls back gracefully.

### 4.3 RAG Service Decomposition

The current `RagService` (~1200 lines) does everything. Decompose into:

| New Service | Responsibility | Extracted From |
|-------------|---------------|----------------|
| `EmbeddingService` | Generate embeddings via Ollama, batch management | `RagService.embedAndStoreText` |
| `ChunkingService` | Text chunking strategies (token, structured, semantic) | `RagService` chunking logic + `ZIMExtractionService` |
| `VectorStoreService` | Qdrant CRUD, collection management, payload indexes | `RagService._ensureCollection`, upsert, search |
| `RetrievalService` | Query processing, search, reranking, diversity, context assembly | `RagService.searchSimilarDocuments` |
| `IngestionService` | Orchestrate file processing pipeline | `RagService.processAndEmbedFile` |
| `ContentExtractorService` | PDF, image (OCR), text, HTML extraction | `RagService.processPDFFile`, etc. |
| `QueryProcessingService` | Query rewriting, expansion, multi-query | `OllamaController.rewriteQueryWithContext` |

The `OllamaController.chat()` orchestration (~190 lines) moves to a new `AIChatOrchestrator` service.

---

## 5. Phase-by-Phase Build Plan

### Phase 0: Foundation (Week 1-2)

**Goal:** Scaffold project, database, auth, and Docker infrastructure. No AI yet.

1. Initialize AdonisJS 6 project with ESM TypeScript
2. Configure MySQL + Redis in Docker Compose
3. Implement User model with session auth, RBAC (viewer/operator/admin)
4. Create KV Store model with typed schema
5. Create Service model for Docker service tracking
6. Set up Inertia.js + React 19 + Tailwind CSS 4 + Vite
7. Build login page, setup page (first-user creation)
8. Build basic shell layout with navigation
9. Implement audit logging middleware
10. Set up BullMQ queue infrastructure

**Migrations:** `users`, `remember_me_tokens`, `kv_store`, `services`, `audit_logs`

### Phase 1: AI Core (Week 3-5)

**Goal:** AI conversation system works end-to-end with basic knowledge base. Most critical phase.

1. Implement `OllamaService` — client init, model management, chat, stream, embed
2. Implement `VectorStoreService` — Qdrant client, collection management, CRUD
3. Implement `EmbeddingService` — batch embedding with nomic-embed-text, progress tracking
4. Implement `ChunkingService` — token-based + structured chunking
5. Implement `RetrievalService` — semantic search, hybrid reranking, source diversity
6. Implement `QueryProcessingService` — query rewriting, expansion, multi-query
7. Implement `AIChatOrchestrator` — central orchestration service
8. Create `ChatSession` and `ChatMessage` models **with `user_id` FK**
9. Build the chat UI as the primary interface (full page, not modal)
10. Implement SSE streaming with thinking indicator support
11. Implement model role configuration (embedder, classifier, rewriter, generator)
12. Build model selection UI with hardware fitness indicators

**New Models:**
- `chat_sessions` (id, user_id, title, model, metadata JSON, created_at, updated_at)
- `chat_messages` (id, session_id, role, content, thinking, metadata JSON, sources JSON, created_at)
- `model_roles` (id, role_name, model_name, priority, is_fallback, config JSON)

**Key Decisions:**
- Chat messages store `sources` JSON linking to knowledge base entries used
- `metadata` JSON stores: tokens_used, latency_ms, model_used, thinking_duration
- Chat page is `/` (root) for authenticated users, not `/chat`
- Current "Command Center" home grid becomes secondary navigation

### Phase 2: Knowledge Ingestion (Week 6-8)

**Goal:** Content flows into the knowledge base through multiple pipelines.

1. Implement `ContentExtractorService` — PDF (text + OCR fallback), images (Tesseract), text, HTML
2. Implement `IngestionService` — orchestrate extract -> chunk -> embed -> store
3. Port `ZIMExtractionService` — structured content extraction with article/section metadata
4. Implement `EmbedFileJob` — BullMQ job with batch processing for large ZIM files
5. Build file upload UI and knowledge base management page
6. Implement `InstalledResource` model with `rag_enabled` tracking
7. Implement storage sync
8. Auto-embed docs on first boot
9. Implement event emission on ingestion for future subscribers

**New Model:** `knowledge_sources` (id, source_path, source_type, chunk_count, embed_status, quality_score, metadata JSON)

**Key Decision:** Every content source gets a lifecycle row: discovered -> extracting -> chunking -> embedding -> indexed -> failed. Replaces implicit tracking via Qdrant scroll + file existence.

### Phase 3: Content Services (Week 9-11)

**Goal:** ZIM library, maps, downloads, and Docker service management.

1. Port `DockerService` — container management via Dockerode
2. Port `DownloadService` + `RunDownloadJob` — bandwidth throttling, priority, retry
3. Port `ZimService` — ZIM file management, curated categories
4. Port `MapService` — PMTiles region management
5. Port `CollectionManifestService` — remote manifest fetching and caching
6. Build content browsing pages (ZIM library, maps, downloads)
7. Build Docker service management UI
8. Wire content downloads to auto-trigger embedding pipeline
9. Implement content recommendation via AI (suggest ZIM files based on user queries)

**Key Difference:** Download -> embed is the default pipeline, and the AI proactively suggests content: "I noticed you've been asking about medical topics. Would you like me to download the Medicine ZIM library?"

### Phase 4: AI-Assisted Workflows (Week 12-14)

**Goal:** The AI can do things, not just answer questions.

1. Implement Tool Registry — structured function definitions the AI can invoke
2. Implement AI-guided setup wizard (replaces static Easy Setup pages)
3. Implement scenario pack installation via conversation
4. Implement mesh message summarization
5. Implement content search via conversation
6. Implement system diagnostics via conversation
7. Build intent classifier using small model
8. Implement tool execution framework with parameter validation and confirmation

**Tool Examples:**
```typescript
{ name: 'install_service', requiresRole: 'operator',
  handler: (params) => dockerService.installService(params.service_name) }

{ name: 'download_content', requiresRole: 'operator',
  handler: (params) => downloadService.queueDownload(params) }

{ name: 'search_knowledge_base', requiresRole: 'viewer',
  handler: (params) => retrievalService.search(params.query, params.limit) }
```

**Key Decision:** Tools require RBAC-aware execution. A viewer can ask "what services are available?" but only an operator can say "install Kiwix." The AI explains permission limitations naturally.

### Phase 5: Networking and Communication (Week 15-16)

**Goal:** WiFi AP, captive portal, and Meshtastic mesh integration.

1. Port `WifiApService` — hostapd/dnsmasq management, QR code generation
2. Port `MeshService` — MQTT subscription, message persistence, node tracking
3. Build mesh communication UI (message board, node list, channels)
4. Build WiFi AP configuration UI
5. Implement mesh message embedding — mesh conversations are searchable knowledge
6. Implement mesh traffic summarization (periodic AI summaries)
7. Wire captive portal to AI interface (new users land on chat)

**Key AI-First Difference:** Mesh messages are automatically embedded with `content_type: 'mesh_message'`. When a user asks "what have the field teams been reporting?", the AI retrieves relevant mesh messages alongside other knowledge.

### Phase 6: Hardening and Quality (Week 17-19)

1. Implement full security middleware suite (CSRF, CSP, SSRF, rate limiting)
2. Implement comprehensive audit logging
3. Build admin-only pages (user management, audit logs, backup/restore)
4. Implement retrieval quality metrics
5. Implement AI response feedback (thumbs up/down per message)
6. Build prompt template management UI (admin-only)
7. Implement backup/restore for all state
8. Load testing for concurrent chat sessions
9. Implement graceful degradation (Ollama down, Qdrant down, etc.)

### Phase 7: Polish and Migration (Week 20-22)

1. Port install script with AI-first defaults
2. Build system updater sidecar
3. Build comprehensive docs
4. Performance optimization (embedding throughput, inference latency, query time)
5. Build system benchmark tool
6. Migration tool for existing installations (data migration from v1 schema)
7. Final UI polish

---

## 6. Data Model

### Core AI Models (new or redesigned)

```sql
-- Chat sessions are per-user (CHANGED from current: no user_id)
CREATE TABLE chat_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
  model VARCHAR(255),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Chat messages with source tracking (ENHANCED)
CREATE TABLE chat_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  role ENUM('system', 'user', 'assistant') NOT NULL,
  content LONGTEXT NOT NULL,
  thinking TEXT,
  sources JSON,   -- [{source_id, score, chunk_text_preview}]
  metadata JSON,  -- {tokens_in, tokens_out, latency_ms, model_used}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- NEW: Model role assignments
CREATE TABLE model_roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL,  -- embedder, classifier, rewriter, generator_small, etc.
  model_name VARCHAR(255) NOT NULL,
  priority INT DEFAULT 0,
  is_fallback BOOLEAN DEFAULT FALSE,
  config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_name, model_name)
);

-- NEW: Knowledge source lifecycle tracking
CREATE TABLE knowledge_sources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_path VARCHAR(1024) NOT NULL,
  source_type ENUM('upload', 'zim', 'zim_article', 'mesh_message', 'note', 'system_doc') NOT NULL,
  display_name VARCHAR(255),
  chunk_count INT UNSIGNED DEFAULT 0,
  embed_status ENUM('pending', 'extracting', 'chunking', 'embedding', 'indexed', 'failed', 'disabled') DEFAULT 'pending',
  error_message TEXT,
  quality_score DECIMAL(5,4),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_source_type (source_type),
  INDEX idx_embed_status (embed_status)
);

-- NEW: Retrieval feedback for quality tracking
CREATE TABLE retrieval_feedback (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  rating TINYINT NOT NULL,  -- -1 (bad), 0 (neutral), 1 (good)
  source_id BIGINT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- NEW: Prompt templates (replaces hardcoded SYSTEM_PROMPTS)
CREATE TABLE prompt_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  template LONGTEXT NOT NULL,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- NEW: Tool definitions
CREATE TABLE tool_definitions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  parameters JSON NOT NULL,
  required_role ENUM('viewer', 'operator', 'admin') DEFAULT 'viewer',
  handler_service VARCHAR(255) NOT NULL,
  handler_method VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Unchanged Models (port as-is)

- `users` — same schema, same auth setup
- `audit_logs` — same
- `services` — same Docker service tracking
- `kv_store` — same, with extended keys for AI config
- `installed_resources` — same (ZIM/map tracking with `rag_enabled`)
- `mesh_nodes`, `mesh_messages` — same
- `benchmark_results`, `benchmark_settings` — same
- `collection_manifests`, `wikipedia_selections` — same

### Qdrant Collection Schema (enhanced)

```
Collection: attic_knowledge_base
Vector: 768 dimensions, Cosine distance

Payload fields (indexed):
  - source: keyword
  - content_type: keyword  (upload, zim_article, mesh_message, note, system_doc)
  - source_id: integer     (FK to knowledge_sources table — NEW)
  - article_title: keyword
  - document_id: keyword
  - language: keyword      (NEW, for multilingual)
  - created_at: integer    (for recency boosting)
  - quality_score: float   (from feedback — NEW)

Payload fields (non-indexed):
  - text, chunk_index, total_chunks, keywords
  - section_title, full_title, hierarchy
  - archive_title, archive_creator, etc.
```

---

## 7. Content Ingestion Pipeline

### Current Pipeline
```
Upload/Download -> determineFileType -> extract text -> TokenChunker -> embed batch -> Qdrant upsert
```

Problems: monolithic switch statement, ZIM special-cased, no lifecycle tracking, no quality validation.

### AI-First Pipeline

```
[Content Arrives]
    |
    v
[IngestionService.ingest(source)]
    +-- Create knowledge_sources row (status: pending)
    +-- Emit 'content:received' event
    |
    v
[ContentExtractorService.extract(source)]
    +-- Detect file type (PDF, image, text, HTML, ZIM, mesh)
    +-- Extract raw text (PDF: pdf-parse + OCR; Image: Tesseract; ZIM: structured)
    +-- Update knowledge_sources (status: extracting -> extracted)
    +-- Emit 'content:extracted' event
    |
    v
[ChunkingService.chunk(text, strategy)]
    +-- Select strategy:
    |     - 'token': TokenChunker (1700 tokens, 150 overlap) for raw text
    |     - 'structured': heading-aware splitting for HTML/ZIM
    |     - 'semantic': paragraph-boundary splitting for well-formed docs
    +-- Apply sanitization + truncation safety
    +-- Update knowledge_sources (status: chunked, chunk_count: N)
    |
    v
[EmbeddingService.embed(chunks)]
    +-- Verify embedding model available
    +-- Add task prefix: "search_document: "
    +-- Batch embed (batch_size: 8)
    +-- Upsert to Qdrant with full metadata
    +-- Update knowledge_sources (status: indexed)
    |
    v
[Quality Validation] (NEW, optional, async)
    +-- Sample random chunks, run test queries, verify reasonable scores
    +-- Update knowledge_sources.quality_score
```

---

## 8. Frontend Architecture

### Current UI: Content-Centric
```
Login -> Home Grid (tiles) -> [Chat | Maps | Kiwix | Settings | ...]
```

### AI-First UI: Conversation-Centric
```
Login -> AI Conversation (full screen, primary)
              |
              +-- Left sidebar: Session list
              +-- Center: Conversation
              +-- Right sidebar (collapsible): Knowledge sources, citations
              |
         Top Nav: [Chat] [Content Library] [Maps] [Mesh] [Admin]
```

### Key UI Changes

**1. Chat as Landing Page**
After auth, user lands on conversation interface. Route `/` renders AI chat. Current home grid becomes `/dashboard`.

**2. Enhanced Chat Interface**
- Citation markers: inline `[1]`, `[2]` linking to source details in right panel
- Tool execution indicators: structured cards showing progress/result
- Multi-modal input: file upload directly in chat input (triggers ingestion)
- Knowledge base context panel: collapsible right panel showing retrieved sources
- Suggested follow-ups: 2-3 related questions after each response
- Feedback buttons: thumbs up/down per message

**3. Navigation Model**
Replace `AppLayout` header with compact top nav:
```
[Logo] [AI Chat] [Library] [Maps] [Mesh] [Settings] [User Menu]
```
AI Chat is always the primary tab.

**4. Onboarding Flow (AI-Guided)**
Current: Login -> `/easy-setup` (static wizard)
AI-First: Login -> AI conversation with onboarding system prompt that guides through setup, recommends scenario packs, installs services, and downloads models.

---

## 9. Infrastructure and Deployment

### Docker Compose (AI-First)

Ollama and Qdrant are **mandatory services**, not optional installs:

```yaml
services:
  admin:
    depends_on:
      mysql: { condition: service_healthy }
      redis: { condition: service_healthy }
      ollama: { condition: service_healthy }    # NEW: required
      qdrant: { condition: service_healthy }    # NEW: required

  mysql: # Same as current
  redis: # Same as current

  ollama:                                        # NEW: mandatory
    image: ollama/ollama:latest
    container_name: attic_ollama
    restart: unless-stopped
    volumes:
      - ${NOMAD_ROOT}/ollama:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]

  qdrant:                                        # NEW: mandatory
    image: qdrant/qdrant:v1.16
    container_name: attic_qdrant
    restart: unless-stopped
    volumes:
      - ${NOMAD_ROOT}/qdrant:/qdrant/storage
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/collections"]
```

Kiwix, CyberChef, FlatNotes, Kolibri remain dynamically installed (content services, not AI infrastructure).

### Hardware Requirements

| Tier | Use Case | CPU | RAM | GPU | Storage |
|------|----------|-----|-----|-----|---------|
| Minimum | AI chat with 1.5B model | 2-core | 8 GB | None | 20 GB |
| Recommended | AI chat + RAG + content | 4-core | 32 GB | NVIDIA RTX 3060+ | 250 GB SSD |
| Power | Multi-model, large knowledge base | 8-core | 64 GB | NVIDIA RTX 4090 | 1 TB NVMe |

### Entrypoint Changes

Current: migrations -> seed -> queue workers -> app start.

AI-first adds:
1. Wait for Ollama + Qdrant health checks
2. Pull embedding model if not present (`ollama pull nomic-embed-text:v1.5`)
3. Pull default small model if no models exist (`ollama pull qwen2.5:1.5b`)
4. Create Qdrant collection if not exists
5. Run migrations, seed
6. Start queue workers (embedding queue gets dedicated worker)
7. Start app
8. Trigger `IngestionService.discoverAndEmbedSystemDocs()` (non-blocking)

---

## 10. Security and Access Control

### What Stays the Same
- Session auth with scrypt hashing
- RBAC (viewer/operator/admin)
- CSRF, CSP, VineJS validation, audit logging, SSRF protection
- File upload restrictions, path traversal guards

### What Changes for AI-First

**1. Per-user chat isolation**
`ChatSession.user_id` is required. Users only see their own sessions. Admins can view all for audit.

**2. Tool execution RBAC**
- Viewers: search knowledge base, browse content, ask questions
- Operators: install services, download content, manage KB, configure WiFi/mesh
- Admins: manage users, audit logs, prompt templates, backup/restore

The AI explains permission denials naturally.

**3. Prompt injection mitigation**
- System prompts never sent to client
- User input sandboxed in message array
- Tool execution requires explicit confirmation for destructive actions
- All tool executions audit-logged with full context
- Model outputs never used as system prompts for subsequent requests
- Rate limiting on chat requests (per-user)

---

## 11. Offline-First Considerations

**1. Model availability not guaranteed**
If no model available: show "AI setup required" state, allow navigation to settings via traditional UI fallback.

**2. Embedding model must be pre-loaded**
Install script pre-pulls nomic-embed-text. System validates on startup.

**3. No external API fallbacks**
Installer caches model catalog at install time. `FALLBACK_RECOMMENDED_OLLAMA_MODELS` pattern is correct — keep and expand.

**4. Content collection manifests**
Must be cached during install, optionally refreshed when internet available.

**5. First-boot without internet**
Pre-built images (SD card, USB) must have base models pre-loaded. Onboarding AI works with whatever is available. No "download required" gates.

**6. Model size management**
Track total storage. Warn before downloads exceeding available space. Allow purging unused models.

---

## 12. Testing Strategy

### Unit Tests

| Component | What to Test |
|-----------|-------------|
| ChunkingService | Chunk size boundaries, overlap, strategy selection |
| QueryProcessingService | Expansion matches, rewriting with mocked LLM |
| RetrievalService | Reranking math, diversity penalty, quality gate |
| VectorStoreService | Collection creation, upsert, search with mocked Qdrant |
| ContentExtractorService | PDF extraction, OCR fallback, text handling |
| Model Role Resolution | Fallback chain when model unavailable |
| Tool Registry | RBAC enforcement, parameter validation |

### Integration Tests

| Scenario | What to Test |
|----------|-------------|
| End-to-end RAG | Upload -> embed -> query -> verify relevant result |
| Chat flow | Create session -> send message -> verify persistence |
| ZIM ingestion | Process ZIM fixture -> verify chunks and metadata |
| Tool execution | Command -> classify -> execute -> verify result |

### AI Quality Tests (new)

**Retrieval Accuracy:**
- Golden set of 50+ query-answer pairs
- Track Mean Reciprocal Rank (MRR) and Recall@K

**Context Injection Quality:**
- Does the LLM actually USE the context?
- Measure citation rate and hallucination rate

**Chunking Strategy Validation:**
- Verify section boundaries preserved in structured content
- Compare structured vs token-only retrieval accuracy

### Performance Targets

| Metric | Target |
|--------|--------|
| Embedding throughput | 100 chunks/minute on CPU |
| Search latency (Qdrant) | <200ms for 100K vectors |
| Query rewrite latency | <2s with 3B model |
| Time to first token | <5s with 8B model |
| Full response time | <30s for typical query |

---

## Summary of Key Architectural Decisions

1. **Chat is `/`, not `/chat`.** The AI conversation is the default authenticated experience.
2. **Ollama + Qdrant are mandatory infrastructure**, in compose.yaml from day one.
3. **The RAG service is decomposed** into 7 focused services instead of one 1200-line monolith.
4. **Chat sessions are per-user** with `user_id` foreign key.
5. **Model roles are configurable**, stored in database, not hardcoded constants.
6. **System prompts are templates** in database with versioning.
7. **Content ingestion is event-driven** with lifecycle tracking in `knowledge_sources`.
8. **Tool execution enables AI-assisted workflows** with RBAC enforcement.
9. **The Easy Setup wizard is replaced** by AI-guided onboarding conversation.
10. **Retrieval quality is measurable** via feedback tracking and golden-set benchmarks.

---

## Critical Files Reference (Current Codebase)

| File | Significance |
|------|-------------|
| `app/services/rag_service.ts` | 1200-line monolith to decompose into 7 services |
| `app/controllers/ollama_controller.ts` | Chat orchestration to extract into `AIChatOrchestrator` |
| `app/services/chat_service.ts` | Enhance for per-user sessions, sources, feedback |
| `constants/ollama.ts` | Hardcoded prompts and limits to move to database |
| `inertia/components/chat/index.tsx` | Restructure as primary application interface |
| `app/services/zim_extraction_service.ts` | Port structured extraction into generic `StructuredChunker` |
| `app/jobs/embed_file_job.ts` | Keep batch processing pattern, integrate with lifecycle tracking |
| `start/routes.ts` | Reorganize around AI-first navigation model |
