# The Attic AI — Phased Build Plan

Each phase has a **test gate** that must pass before advancing. Complexity: S = hours, M = 1-2 days, L = 3+ days.

---

## Phase 0: Scaffold & Infrastructure

**Goal:** Project structure, Docker Compose, auth, and streaming POC. No AI yet.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 0.1 | Initialize AdonisJS 6 project (ESM TypeScript), configure `tsconfig.json`, install core deps | `package.json`, `tsconfig.json`, `adonisrc.ts` | M |
| 0.2 | Docker Compose with MySQL, Redis (:6379), Ollama, Qdrant, FalkorDB (:6380), Python sidecar — with healthchecks and profiles | `docker-compose.yml`, `.env.example` | M |
| 0.3 | User model + session auth + RBAC middleware (viewer/operator/admin) + first-user setup | `app/models/user.ts`, `app/middleware/auth_middleware.ts`, `database/migrations/*_users.ts` | M |
| 0.4 | Inertia.js + React 19 + Tailwind CSS 4 + Vite setup, login page, app shell layout | `inertia/`, `vite.config.ts`, `inertia/pages/login.tsx`, `inertia/layouts/app_layout.tsx` | M |
| 0.5 | BullMQ queue infrastructure with `@rlanz/bull-queue`, Redis `noeviction` health check on startup | `config/queue.ts`, `app/services/health_check_service.ts`, `start/health.ts` | S |
| 0.6 | Streaming POC: AdonisJS controller returning `ReadableStream`, React component consuming via `fetch` + `ReadableStream` — validates Inertia bypass pattern | `app/controllers/stream_test_controller.ts`, `inertia/hooks/use_stream.ts` | S |

**Test gate:**
```bash
# All must pass:
node ace test                              # Unit tests pass
docker compose up -d && sleep 10           # All containers healthy
curl -f http://localhost:3333/login        # App serves login page
curl -f http://localhost:11434/api/tags    # Ollama reachable
curl -f http://localhost:6333/collections  # Qdrant reachable
curl -f http://localhost:6380/ping         # FalkorDB Redis reachable
```

---

## Phase 1: AI Core — Chat & RAG Pipeline

**Goal:** End-to-end AI chat with vector retrieval. The critical phase.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 1.1 | OllamaService — client init, async mutex for request serialization, model management (pull/list/show/delete), chat stream, embed batch | `app/services/ollama_service.ts` | L |
| 1.2 | VectorStoreService — Qdrant collection creation with dense (768-dim) + sparse (BM42) vectors, payload indexes, batch upsert, hybrid search via Query API | `app/services/vector_store_service.ts` | L |
| 1.3 | EmbeddingService — batch embedding via Ollama with `search_document:` prefix, 1800-token ceiling enforcement, progress tracking | `app/services/embedding_service.ts` | M |
| 1.4 | ChunkingService — token-based (1700 tokens, 150 overlap) + structured/heading-aware via @chonkiejs/core | `app/services/chunking_service.ts` | M |
| 1.5 | ChatSession + ChatMessage models with `user_id` FK, sources JSON, metadata JSON. ModelRole model + seed defaults. Migrations. | `app/models/chat_session.ts`, `app/models/chat_message.ts`, `app/models/model_role.ts`, `database/migrations/*` | M |
| 1.6 | AIChatOrchestrator — wires intent classification, retrieval, model selection, prompt assembly, streaming generation, message persistence | `app/services/ai_chat_orchestrator.ts`, `app/controllers/chat_controller.ts` | L |
| 1.7 | Chat UI — full-screen primary interface at `/`, custom `useChat` hook with `fetch` + `ReadableStream`, shadcn/ui AI components, session sidebar, markdown rendering, citation display | `inertia/pages/chat.tsx`, `inertia/hooks/use_chat.ts`, `inertia/components/chat/*` | L |

**Test gate:**
```bash
node ace test --tags=ai-core              # All AI core unit tests pass
# Integration test (requires running Docker services):
node ace test --tags=integration:chat     # Create session → send message → verify streamed response + persistence
```

---

## Phase 2: Knowledge Ingestion & Graph

**Goal:** Content flows into both vector store and knowledge graph.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 2.1 | ContentExtractorService — file type detection, `unpdf` for PDF text, `tesseract.js` OCR fallback, text/HTML extraction | `app/services/content_extractor_service.ts` | M |
| 2.2 | IngestionService — BullMQ FlowProducer pipeline (Extract→Chunk→Embed→EntityExtract), `knowledge_sources` lifecycle tracking | `app/services/ingestion_service.ts`, `app/models/knowledge_source.ts`, `database/migrations/*_knowledge_sources.ts` | L |
| 2.3 | Python sidecar — FastAPI app with `/extract/zim` (python-libzim) and `/extract/entities` (GraphRAG-SDK + Ollama) endpoints | `sidecar/main.py`, `sidecar/extractors/zim.py`, `sidecar/extractors/entities.py`, `sidecar/Dockerfile`, `sidecar/pyproject.toml` | L |
| 2.4 | GraphService — FalkorDB client wrapper, graph schema creation (entity types, indexes), Cypher query helpers, config-gated behind `FALKORDB_ENABLED` | `app/services/graph_service.ts` | M |
| 2.5 | RetrievalService — hybrid retrieval (vector + graph), RRF fusion, QueryProcessingService (rewriting via small model, multi-query), source diversity | `app/services/retrieval_service.ts`, `app/services/query_processing_service.ts` | L |
| 2.6 | File upload UI + knowledge base management page — upload, view sources, lifecycle status, re-embed, delete | `inertia/pages/knowledge.tsx`, `app/controllers/knowledge_controller.ts` | M |

**Test gate:**
```bash
node ace test --tags=ingestion            # Chunking, extraction, embedding unit tests
node ace test --tags=integration:ingest   # Upload PDF → verify chunks in Qdrant + entities in FalkorDB
curl -f http://localhost:8100/health      # Python sidecar healthy
```

---

## Phase 3: Content Services & Docker Management

**Goal:** ZIM library, maps, downloads, Docker service management.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 3.1 | DockerService — container management via Dockerode (install, start, stop, remove, logs, status) | `app/services/docker_service.ts` | M |
| 3.2 | DownloadService + RunDownloadJob — bandwidth throttling, priority queue, retry, progress tracking via BullMQ | `app/services/download_service.ts`, `app/jobs/run_download_job.ts` | M |
| 3.3 | ZimService + MapService — ZIM file management, PMTiles region management, curated categories, CollectionManifestService for remote manifests | `app/services/zim_service.ts`, `app/services/map_service.ts`, `app/services/collection_manifest_service.ts` | L |
| 3.4 | Content browsing pages — ZIM library, maps, downloads queue, Docker service management UI | `inertia/pages/library.tsx`, `inertia/pages/maps.tsx`, `inertia/pages/services.tsx` | L |
| 3.5 | Auto-embed pipeline — download completion triggers ingestion, InstalledResource model with `rag_enabled` tracking | `app/models/installed_resource.ts`, integration with IngestionService | M |

**Test gate:**
```bash
node ace test --tags=content-services     # Docker, download, ZIM service unit tests
node ace test --tags=integration:content  # Download mock ZIM → verify ingestion pipeline triggered
```

---

## Phase 4: AI-Assisted Workflows & Tool Registry

**Goal:** The AI can perform actions, not just answer questions.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 4.1 | ToolRegistry — structured function definitions, RBAC enforcement, parameter validation via VineJS, confirmation for destructive actions | `app/services/tool_registry.ts`, `app/models/tool_definition.ts`, `database/migrations/*_tool_definitions.ts` | M |
| 4.2 | Built-in tools — install_service, download_content, search_knowledge_base, system_diagnostics, manage_model | `app/tools/*.ts` | L |
| 4.3 | Intent classifier integration — route to tools vs RAG vs general chat using classifier model (qwen2.5:1.5b) | Update `app/services/ai_chat_orchestrator.ts` | M |
| 4.4 | AI-guided onboarding — replace static Easy Setup with conversation-driven setup (system prompt template, scenario pack recommendations) | `database/seeders/prompt_templates.ts`, `app/services/onboarding_service.ts` | M |
| 4.5 | PromptTemplateService — versioned templates in MySQL, variable injection, admin CRUD | `app/services/prompt_template_service.ts`, `app/models/prompt_template.ts`, `database/migrations/*_prompt_templates.ts` | S |

**Test gate:**
```bash
node ace test --tags=tools                # Tool registry RBAC, parameter validation tests
node ace test --tags=integration:tools    # "install kiwix" → verify RBAC check → Docker install triggered
```

---

## Phase 5: Networking, Mesh & Communication

**Goal:** WiFi AP, Meshtastic mesh integration, captive portal.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 5.1 | WifiApService — hostapd/dnsmasq management, QR code generation, captive portal routing to chat | `app/services/wifi_ap_service.ts` | M |
| 5.2 | MeshService — MQTT subscription, message persistence (mesh_nodes, mesh_messages models), node tracking | `app/services/mesh_service.ts`, `app/models/mesh_node.ts`, `app/models/mesh_message.ts` | L |
| 5.3 | Mesh message embedding — auto-embed with `content_type: 'mesh_message'`, prompt injection sanitization | Integration with IngestionService | M |
| 5.4 | Mesh UI — message board, node list, channels, WiFi AP config page | `inertia/pages/mesh.tsx`, `inertia/pages/wifi.tsx` | M |
| 5.5 | Mesh summarization — periodic AI summaries of mesh traffic via BullMQ scheduled job | `app/jobs/mesh_summary_job.ts` | S |

**Test gate:**
```bash
node ace test --tags=networking           # Mesh message parsing, WiFi config validation
node ace test --tags=integration:mesh     # Ingest mock mesh message → verify searchable in RAG
```

---

## Phase 6: Hardening, Security & Quality

**Goal:** Production-ready security, observability, and AI quality metrics.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 6.1 | Security middleware — CSRF, CSP, SSRF protection, rate limiting (per-user on chat), file upload restrictions | `app/middleware/security_middleware.ts`, `config/security.ts` | M |
| 6.2 | Audit logging — comprehensive middleware logging all tool executions, admin actions, auth events | `app/middleware/audit_middleware.ts`, `app/models/audit_log.ts` | M |
| 6.3 | Admin pages — user management, audit log viewer, prompt template editor, backup/restore | `inertia/pages/admin/*.tsx`, `app/controllers/admin_controller.ts` | L |
| 6.4 | Retrieval quality — feedback buttons (thumbs up/down per message), retrieval_feedback table, quality_score propagation to Qdrant payloads | `app/models/retrieval_feedback.ts`, update RetrievalService | M |
| 6.5 | Graceful degradation — Ollama down (show setup state), Qdrant down (no-RAG chat), FalkorDB down (vector-only), sidecar down (skip ZIM/entities) | Update all services with fallback paths | M |
| 6.6 | Backup/restore — MySQL dump, Qdrant snapshots, FalkorDB persistence, KV store export | `app/services/backup_service.ts` | M |

**Test gate:**
```bash
node ace test                             # Full test suite passes
node ace test --tags=security             # CSRF, rate limiting, RBAC enforcement tests
node ace test --tags=degradation          # Verify fallback behavior with services down
```

---

## Phase 7: Polish, Performance & Deployment

**Goal:** Install scripts, performance optimization, migration tooling.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 7.1 | Install script — Docker Compose setup, model pre-pull, first-boot configuration, hardware detection for profile selection | `install.sh`, `scripts/detect_hardware.sh` | M |
| 7.2 | Performance optimization — embedding throughput tuning, Qdrant query optimization, MySQL connection pooling, Redis memory tuning | Config updates across services | M |
| 7.3 | System benchmark tool — measure embedding speed, search latency, generation TTFT, compare against targets | `app/services/benchmark_service.ts` | M |
| 7.4 | v1 migration tool — data migration from existing Attic schema to v2 (users, chat history, knowledge base) | `scripts/migrate_v1.ts` | L |
| 7.5 | Dockerfile for attic_admin — multi-stage build, Tesseract lang data pre-download, production Node.js config | `Dockerfile` | M |

**Test gate:**
```bash
node ace test                             # Full suite green
docker compose --profile full up -d       # All services start and pass healthchecks
./install.sh --dry-run                    # Install script validates without executing
node ace benchmark                        # All performance targets met
```

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 0 | 6 | Scaffold, Docker, auth, streaming POC |
| 1 | 7 | AI chat, RAG pipeline, chat UI |
| 2 | 6 | Ingestion, graph RAG, Python sidecar |
| 3 | 5 | Content services, ZIM, maps, Docker mgmt |
| 4 | 5 | Tool registry, AI workflows, onboarding |
| 5 | 5 | WiFi AP, mesh, communication |
| 6 | 6 | Security, quality metrics, degradation |
| 7 | 5 | Install, perf, migration, Dockerfile |
| **Total** | **45** | |
