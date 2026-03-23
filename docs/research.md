# Research: The Attic AI — Offline-First AI Knowledge Platform

## Executive Summary

The planned stack is validated by prior art (Open WebUI, AnythingLLM, Onyx, Khoj all converge on similar patterns). Three decisions must be made before Phase 1: (1) ZIM extraction requires a Python sidecar — no viable Node.js ZIM parser exists, (2) Qdrant hybrid search (sparse + dense vectors) must be declared at collection creation time or you'll re-embed everything later, and (3) LLM streaming must bypass Inertia.js entirely via direct `fetch` + `ReadableStream`. The highest operational risks are Ollama's single-model concurrency on CPU hardware and Redis misconfiguration silently dropping BullMQ jobs.

## Problem Statement

Build an offline-first, air-gapped AI knowledge platform running Ollama (local LLM) and Qdrant (vector search) on edge hardware (Raspberry Pi to desktop). Must ingest ZIM files, PDFs, uploads, and mesh messages into a RAG pipeline, serve per-user chat with citations, and orchestrate multi-model inference — all via AdonisJS 6 + React 19 + Docker Compose.

## Technology Evaluation

### Recommended Stack

| Category | Choice | Why |
|---|---|---|
| Ollama client | `ollama` (official, v0.6.3) | Only client with full model management API (pull/list/show/delete). Needed for offline boot validation |
| Qdrant client | `@qdrant/js-client-rest` | LangChain wrapper has confirmed `pageContent: undefined` bug (#9760). Direct client needed for collection management |
| Text chunking | `@chonkiejs/core` | Zero deps, TS-native, heading-aware. Already in v1 codebase. Add `@langchain/textsplitters` only if BPE-exact splits needed |
| PDF extraction | `unpdf` v1.4.0 | `pdf-parse` unmaintained since 2019, fails on ARM Docker. `unpdf` is ESM-native, zero native deps |
| OCR | `tesseract.js` 6.x | v6 fixed memory leaks. Pre-download lang data in Docker build. ~2-10s/page on CPU |
| SSE streaming | Native `ReadableStream` | AdonisJS 6 supports returning `ReadableStream` directly from controllers. Use `@adonisjs/transmit` only for broadcast events (job progress, admin notifications) — not per-token LLM streaming |
| Job queue | BullMQ 5.x + `@rlanz/bull-queue` 3.1.0 | Use `FlowProducer` for Extract→Chunk→Embed pipeline. True batching is paid-tier — batch within single job handlers instead |
| Chat UI | `shadcn/ui` AI components | Copy-paste (no npm dep), built for streaming, includes citations/thinking/tool-calls. Custom `useChat` hook (~100 lines) needed to replace Vercel AI SDK protocol |
| ZIM extraction | **Python sidecar** (FastAPI + python-libzim) | Hard constraint: no viable Node.js ZIM parser exists. Every ZIM+RAG project uses python-libzim |

### Inertia.js v2 vs v3

v3 is in beta, requires React 19 (already in stack), replaces Axios with built-in XHR, adds optimistic updates. **Evaluate v3 before committing to v2** — the v2→v3 migration will be disruptive. If v3 isn't GA by Phase 0 completion, ship on v2.

## Architecture Patterns From Prior Art

### Reference Implementations

| Project | Relevance | Key Takeaway |
|---|---|---|
| **Open WebUI** | Closest analog — local Ollama chat UI | Mature streaming implementation, plugin architecture. Monolithic Python backend doesn't match our stack but UX patterns are gold |
| **AnythingLLM** | Desktop RAG app, multi-provider | Good model of workspace-scoped knowledge bases. Overly coupled embedding/retrieval code — validates our 7-service decomposition |
| **Onyx (Danswer)** | Enterprise RAG, multi-source ingestion | Best-in-class connector architecture. Confirms event-driven ingestion with lifecycle tracking. Python-heavy |
| **Khoj** | Self-hosted AI with local models | Good multi-model routing patterns. Intent classification via small LLM (not fine-tuned classifier) is the pragmatic starting point |
| **Perplexica** | Open-source Perplexity clone | Clean search→rerank→generate pipeline. Avoids framework-level data fetching for generation stream — validates our Inertia bypass approach |
| **LibreChat** | Multi-provider chat platform | RAG API is a separate Python sidecar (validates our ZIM sidecar pattern). Streaming bypasses Next.js data layer |

### Consensus Patterns

- **Retrieve wide, rerank narrow**: top-40 candidates → rerank to top-5. This is the current consensus across all mature implementations.
- **RAG service decomposition**: Onyx, Khoj, and LibreChat all evolved from monolithic RAG into separated services — validates splitting the 1,200-line `RagService`.
- **LLM-based intent classification**: Using qwen2.5:1.5b is sufficient. A trained DistilBERT classifier adds ~21% accuracy (Pick and Spin paper) but requires labeled training data — LLM approach is the right starting point.
- **Hybrid search is table stakes**: Qdrant v1.16 supports BM42 sparse vectors + dense vectors + RRF fusion natively. Must declare sparse vector support at collection creation — adding later requires destroying and re-embedding the entire collection.

## Key APIs and Services

| Service | Port | Critical Config |
|---|---|---|
| Ollama | 11434 | `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1` on CPU. Pin embedding model with `keep_alive: -1` |
| Qdrant | 6333 (REST) | Enable scalar quantization from day one (75% memory reduction). Set `on_disk: true` for constrained devices. Create payload indexes at collection setup time |
| Redis | 6379 | **`maxmemory-policy noeviction` is mandatory** — any other policy silently drops BullMQ jobs. Set explicit `maxmemory` (512mb) |
| MySQL | 3306 | `innodb_buffer_pool_size=256M` on 4GB devices. Do NOT use `--innodb-dedicated-server` when sharing RAM |

## Known Pitfalls and Risks

### Critical (must address before Phase 1)

1. **Ollama concurrency** — `OLLAMA_NUM_PARALLEL=1` is a hard constraint on CPU. Embedding model and LLM fight for RAM. Pin embedding model with `keep_alive: -1`. Implement request serialization (async mutex) at the application layer.
2. **nomic-embed-text context overflow** — chunks exceeding 2048 tokens crash the Ollama runner (SIGTRAP). Enforce hard 1800-token ceiling in ChunkingService.
3. **Qdrant hybrid search schema** — sparse vector support must be declared at collection creation. One-line decision now; full re-embed later if missed.
4. **Inertia.js + SSE streaming** — Inertia navigation events interrupt in-flight SSE streams. Chat UI must own its own streaming state via `fetch` + `ReadableStream`, bypassing Inertia's data layer. Build a proof-of-concept in Phase 0.
5. **ZIM extraction** — No Node.js ZIM parser. Add `attic_zim_extractor` FastAPI sidecar to Docker Compose in Phase 0, not Phase 2.

### Important (address during implementation)

6. **Redis noeviction** — validate in startup health check. Most common invisible production failure in BullMQ deployments.
7. **pdf-parse is dead** — use `unpdf`. No discussion needed.
8. **Qdrant cold-start** — 100K vectors on HDD takes minutes. Docker Compose healthcheck must wait for readiness. Use SSD.
9. **AdonisJS Lucid JSON columns** — `updateOrCreate` breaks on JSON columns. Use `find + merge + save` pattern.
10. **Tesseract.js first-run** — language model download blocks first OCR job. Pre-bake into Docker image.
11. **Mesh message prompt injection** — untrusted external text in RAG context is an attack surface. Needs sanitization before Phase 5.
12. **Inertia props payload size** — serializes into HTML. Paginate aggressively (20 items max) or use API endpoints for large datasets.

## Recommended Stack Versions (Pin These)

| Component | Version | Notes |
|---|---|---|
| AdonisJS | 6.x | ESM-only. All imports need `.js` extension |
| React | 19.x | |
| Inertia.js | 2.x (evaluate 3 beta) | |
| Ollama | 0.6.x | Avoid 0.12.x (embedding crashes) |
| Qdrant | 1.16.x | Enable BM42 + scalar quantization |
| BullMQ | 5.x | |
| nomic-embed-text | v1.5 | 768-dim, enforce task prefixes |
| unpdf | 1.4.x (pin exact) | Pre-1.0 API may change |
| tesseract.js | 6.x | Pre-download lang data |
| @chonkiejs/core | latest | |
| shadcn/ui | copy-paste (no version) | |

## Open Questions

1. **Hardware floor** — Is there a GPU? CPU-only changes embedding throughput by 10-50x and makes multi-model operation impractical.
2. **Inertia v3 timing** — Worth waiting for GA? v3 adds optimistic updates and drops Axios.
3. **Qdrant quantization** — Commit to 768-dim float32 or int8 (quantized) before first ingestion. Cannot mix within a collection.
4. **Offline model distribution** — How are Ollama models delivered to edge devices without internet? Bundle in Docker image vs. pre-loaded storage volume?
5. **MySQL vs SQLite** — For single-node edge deployment, SQLite would save ~200MB RAM. Worth evaluating if RAM is the primary constraint.
6. **ZIM sidecar scope** — Should the Python sidecar handle only ZIM extraction, or also OCR and other Python-ecosystem tasks (spaCy NER, etc.)?

## Sources

### Ollama
- [Ollama JS client (npm)](https://www.npmjs.com/package/ollama) · [GitHub](https://github.com/ollama/ollama-js)
- [Streaming format & tools bug #9084](https://github.com/ollama/ollama/issues/9084)
- [nomic-embed-text crash #13054](https://github.com/ollama/ollama/issues/13054)
- [Concurrent request handling](https://www.glukhov.org/post/2025/05/how-ollama-handles-parallel-requests/)

### Qdrant
- [@qdrant/js-client-rest (GitHub)](https://github.com/qdrant/qdrant-js)
- [BM42 hybrid search](https://qdrant.tech/articles/bm42/) · [Hybrid search guide](https://qdrant.tech/articles/hybrid-search/)
- [Memory consumption guide](https://qdrant.tech/articles/memory-consumption/)
- [Large-scale ingestion](https://qdrant.tech/course/essentials/day-4/large-scale-ingestion/)
- [Slow startup #7190](https://github.com/qdrant/qdrant/issues/7190) · [OOM crash #7831](https://github.com/qdrant/qdrant/issues/7831)

### AdonisJS / Inertia
- [AdonisJS native ReadableStream support](https://adonisjs.com/blog/adonisjs-native-response-readablestream-support)
- [AdonisJS Transmit SSE docs](https://docs.adonisjs.com/guides/digging-deeper/server-sent-events)
- [Lucid updateOrCreate JSON bug #962](https://github.com/adonisjs/lucid/issues/962)
- [Inertia.js v3 beta](https://laravel.com/blog/inertiajs-v3-is-now-in-beta)

### Prior Art
- [Open WebUI](https://github.com/open-webui/open-webui) · [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) · [Onyx](https://github.com/onyx-dot-app/onyx)
- [Khoj](https://github.com/khoj-ai/khoj) · [Perplexica](https://github.com/ItzCrazyKns/Perplexica) · [LibreChat](https://www.librechat.ai/docs/configuration/rag_api)
- [Pick and Spin: Multi-Model Orchestration (arXiv)](https://arxiv.org/abs/2512.22402)

### Libraries
- [unpdf](https://github.com/unjs/unpdf) · [chonkiejs](https://github.com/chonkie-inc/chonkiejs)
- [shadcn/ui AI components](https://www.shadcn.io/ai) · [assistant-ui](https://github.com/assistant-ui/assistant-ui)
- [BullMQ production guide](https://docs.bullmq.io/guide/going-to-production)
- [nomic-embed-text v1.5 (HuggingFace)](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- [Edge RAG on Raspberry Pi](https://blog.gopenai.com/harnessing-ai-at-the-edge-building-a-rag-system-with-ollama-qdrant-and-raspberry-pi-45ac3212cf75)

---

# Research: FalkorDB + Knowledge Graph RAG for The Attic AI

## Executive Summary

FalkorDB v4.16.6 is a Redis-module graph database using GraphBLAS linear algebra for traversal, making it 7x more memory-efficient than Neo4j on equivalent datasets. It is the strongest candidate for adding knowledge graph RAG to The Attic AI because it runs fully offline, has a mature TypeScript client (falkordb-ts v6.6.2), and requires only a second Redis container (not a new database engine). The critical constraint to validate before committing: the GraphRAG-SDK (Python) supports Ollama for Q&A but entity extraction during graph building may still require a capable generative model — test with llama3.1:8b before assuming full offline parity. The SSPL license is a known risk for services exposed to external users but is acceptable for self-hosted, on-premises deployments.

## Problem Statement

The Attic AI needs graph-structured retrieval on top of Qdrant vector search. Vector search excels at semantic similarity ("find documents like this") but fails at multi-hop relational queries ("who worked on what, and how do those topics connect?"). A knowledge graph adds explicit entity-relationship structure that the vector index cannot represent. The question is whether FalkorDB is the right graph layer, and whether it can operate fully offline with Ollama as the only LLM.

## Technology Evaluation

### Option A: FalkorDB v4.16.x — Recommended

**What it is:** Graph database implemented as a Redis module. Uses GraphBLAS (sparse matrix algebra) for traversal. Stores property graphs with Cypher query language. First-class AI/RAG positioning — the vendor actively targets this use case.

**Version & maturity:** Core engine v4.16.6 (March 2026). TypeScript client falkordb-ts v6.6.2 (February 2026). Python client 1.6.0 (February 2026). GitHub: ~1,500 stars (small but growing). Actively maintained with biweekly releases.

**Architecture:** Redis module — it IS Redis, running the FalkorDB `.so` module loaded at startup. This means it uses Redis's networking, persistence (RDB/AOF), and memory management. It does NOT share a Redis instance with BullMQ safely — you must run a second Redis container for FalkorDB. Port conflict is trivially solved in Docker Compose.

**License:** Server Side Public License v1 (SSPL). This is NOT OSI-approved open source. For internal/self-hosted deployment with no SaaS exposure it is fine. If The Attic AI ever becomes a cloud service, SSPL requires open-sourcing your entire service stack. Flag this for the future.

**Offline:** Fully offline for the database engine itself. The GraphRAG-SDK Ollama integration enables local LLM usage; see constraints in Section 6.

**Performance:** v4.8 reduced memory 42% vs prior versions. Claims 7x less memory than Neo4j for equivalent datasets. Realistic baseline for 8-32GB edge hardware: allocate 1-2GB for FalkorDB container on a small graph (< 1M nodes), 2-4GB for production-scale knowledge graphs. Query latency for graph traversal is sub-millisecond for 1-3 hops at small scale.

**Cypher support:** Partial Cypher implementation. Known limitation: when a relationship in a MATCH pattern is not referenced elsewhere in the query, FalkorDB verifies only that one matching relation exists rather than iterating all matches — can cause unexpected query behavior. Full Cypher coverage docs at `docs.falkordb.com/cypher/cypher-support.html`.

**Risks:**
- 1,500 GitHub stars is small. Neo4j has 13k+. Community support is thin.
- SSPL license creates future deployment constraints.
- Next-gen Rust rewrite (falkordb-rs-next-gen) exists but has only 8 stars — uncertain timeline to replace current Redis-module architecture.
- GraphRAG-SDK is Python-only. The TypeScript integration exists for the graph database client, not the entity extraction pipeline.

---

### Option B: Neo4j Community Edition — Consider (with caveats)

**What it is:** Industry-standard graph database, JVM-based, disk-backed, full Cypher support, massive community (13k GitHub stars), production-proven.

**Why consider it:** Best Cypher compatibility, largest community, most LangChain/LlamaIndex integrations, abundant documentation, clear upgrade path.

**Why deprioritize for this use case:**
- Java JVM requires 512MB-1GB heap minimum. On 8GB hardware shared with Ollama + Qdrant + MySQL + Redis, this is painful.
- 7x more memory than FalkorDB for equivalent data (per FalkorDB's own benchmark — verify independently, but directionally credible given JVM overhead).
- Neo4j 5.x Community Edition dropped certain enterprise features. Read-only replica support removed. Some clustering features require Enterprise.
- LangChain JS integration exists (`@langchain/community` Neo4jGraph) and is more mature than FalkorDB's.

**Verdict:** Better ecosystem, worse resource fit. Choose Neo4j if you have 16GB+ RAM and need production Cypher compatibility guarantees.

---

### Option C: Memgraph — Consider (streaming-first, high performance)

**What it is:** In-memory graph database, C++ core, full Cypher + MAGE algorithm library, Bolt protocol compatible with Neo4j clients.

**Performance:** Benchmarks show 8-50x faster than Neo4j on read/write workloads. In-memory architecture means faster traversals than FalkorDB in many patterns.

**Memory model:** Requires 2x RAM relative to dataset size. For a 4GB graph, you need 8GB RAM — this is the whole machine on constrained hardware. On-disk storage mode available but degrades performance.

**Offline:** Fully offline, Docker image available.

**Community:** ~4,000 GitHub stars, more than FalkorDB but less than Neo4j.

**Verdict:** Better performance than FalkorDB in benchmarks, but the 2x RAM requirement makes it risky on 8GB devices. Viable at 16GB+.

---

### Option D: Apache AGE (PostgreSQL extension) — Avoid

**What it is:** PostgreSQL extension adding Cypher graph queries via openCypher. Runs inside your existing PostgreSQL/MySQL... but The Attic AI uses MySQL, not PostgreSQL, so this requires adding PostgreSQL to the stack.

**Performance reality:** One analysis found a 40x speed advantage for SQL recursive CTEs over Apache AGE for specific graph patterns. AGE is slower than purpose-built graph databases for traversal-heavy queries.

**Maturity:** Technically Apache-incubated but adoption is thin. Limited TypeScript support. Not suitable for production RAG workloads.

**Verdict:** Avoid. Adding PostgreSQL for this alone increases stack complexity without delivering competitive performance.

---

### Option E: MySQL with Recursive CTEs — Avoid for GraphRAG

**What it is:** Use your existing MySQL with `WITH RECURSIVE` for adjacency/hierarchy queries.

**When it works:** Simple parent-child hierarchies, 1-2 hop traversals, small graphs (< 100k edges).

**When it breaks:** Variable-depth graph traversals, shortest-path algorithms, community detection — all require either multiple queries or application-level logic. No Cypher. No graph algorithms library.

**Verdict:** Use for simple tree structures (e.g., document folder hierarchy) already in MySQL. Do not use as a substitute for knowledge graph RAG.

---

## Architecture Patterns Found

### Hybrid Retrieval: Vector + Graph (HybridRAG)

The canonical 2025 pattern combines Qdrant vector search and a knowledge graph at retrieval time using Reciprocal Rank Fusion (RRF):

```
Query
  ├── Qdrant: embed query → top-40 semantic candidates
  ├── FalkorDB: extract named entities from query → Cypher traversal → related nodes/chunks
  └── RRF fusion → top-5 reranked results → LLM generation
```

Research ([arXiv 2507.03226](https://arxiv.org/abs/2507.03226)) shows hybrid retrieval delivers 15-25% accuracy improvement over pure vector retrieval on multi-hop questions with ~150-200ms orchestration overhead — acceptable for interactive chat.

### Ingestion Pipeline Pattern

```
Document arrives (BullMQ job)
  ├── Chunking (existing ChunkingService)
  ├── Embedding → Qdrant (existing)
  └── Entity extraction (NEW: Python sidecar)
        ├── LLM call: extract entities + relationships from chunk text
        ├── Deduplicate against existing graph nodes
        └── MERGE entities/relationships into FalkorDB via Cypher
```

Key insight: entity extraction is a Python-ecosystem concern. The existing ZIM sidecar (FastAPI + python-libzim) should be extended to handle entity extraction using the GraphRAG-SDK or spaCy + a local Ollama call. This keeps all LLM-driven NLP in the Python sidecar and all graph writes going through a thin HTTP API back to the Node.js ingestion pipeline.

### Query-Time Integration Pattern

```typescript
// In AdonisJS retrieval service
async function hybridRetrieve(query: string): Promise<Context[]> {
  const [vectorResults, graphContext] = await Promise.all([
    qdrantClient.search(collection, { vector: embed(query), limit: 40 }),
    falkordbClient.query(graph, extractEntitiesQuery(query))  // Cypher
  ])
  return rerankWithRRF(vectorResults, graphContext)
}
```

The falkordb-ts client returns typed results; Cypher queries are strings. Build a thin typed wrapper around common traversal patterns (entity lookup, neighbor expansion, path queries).

---

## Key APIs and Services

### FalkorDB Docker (adds to existing Docker Compose)

```yaml
falkordb:
  image: falkordb/falkordb-server:latest  # production-optimized, no browser UI
  ports:
    - "6380:6379"   # Different port — Redis for BullMQ stays on 6379
  volumes:
    - falkordb_data:/data
  environment:
    - REDIS_ARGS=--maxmemory 2gb --maxmemory-policy noeviction --save 60 1
  deploy:
    resources:
      limits:
        memory: 2.5G
        cpus: '2'
```

The `falkordb/falkordb-server` image is lighter than `falkordb/falkordb` (which bundles the browser UI). The BullMQ Redis instance stays on port 6379 unchanged. FalkorDB gets its own Redis process on 6380.

### falkordb-ts Node.js Client

```typescript
import { FalkorDB } from 'falkordb'

const db = await FalkorDB.connect({ socket: { host: 'falkordb', port: 6380 } })
const graph = db.selectGraph('attic_knowledge')
const result = await graph.query(
  'MATCH (e:Entity {name: $name})-[r]->(n) RETURN e, r, n LIMIT 20',
  { params: { name: 'Bitcoin' } }
)
await db.close()
```

Current version: 6.6.2. TypeScript coverage: 99.4%. Node.js >= 20 required (matches AdonisJS 6 requirements). MIT licensed (note: the client is MIT even though the server is SSPL).

### GraphRAG-SDK (Python sidecar extension)

```python
# In existing ZIM sidecar (FastAPI)
from graphrag_sdk import KnowledgeGraph, Ontology
from graphrag_sdk.models.ollama import OllamaGenerativeModel

model = OllamaGenerativeModel(model_name="llama3.1:8b")
kg = KnowledgeGraph(
    name="attic_knowledge",
    model_config=KnowledgeGraphModelConfig.with_model(model),
    ontology=ontology,
)
kg.process_sources(sources)  # entity extraction + graph population
```

Install: `pip install graphrag_sdk` (PyPI package `graphrag-sdk`, import name differs — note the underscore).

---

## Known Pitfalls and Risks

### Critical

1. **Ollama for graph building is unverified for full offline.** Official docs state Ollama is supported for "Q&A step only" in v0.2.0. The announcement for "on-premises GraphRAG with Ollama" is marketing-level vague. Before committing to this architecture, run a proof-of-concept: use Ollama (llama3.1:8b) to extract entities from 50 sample documents and verify graph population works without OpenAI. Small, weak models (< 7B parameters) often fail structured extraction tasks.

2. **Two Redis instances in Docker Compose.** You cannot load FalkorDB as a module into the same Redis instance serving BullMQ. If you try, FalkorDB's persistence and memory policy settings will conflict with BullMQ's `noeviction` requirement. Always run separate containers. This is solvable but adds RAM overhead (a second Redis process uses ~50-100MB baseline).

3. **SSPL license.** For internal/on-premises use this is not an issue today. If The Attic AI ever evolves into a hosted service, SSPL requires open-sourcing your entire service stack or negotiating a commercial license. Flag this now, revisit before any commercial deployment.

4. **Cypher partial coverage.** FalkorDB's Cypher is a subset of the full spec. The specific limitation around unreferenced relationships in MATCH patterns can cause silent correctness bugs in complex traversal queries. Validate all graph queries in a test suite.

5. **GraphRAG-SDK is Python-only.** There is no TypeScript SDK for the entity extraction pipeline. The `falkordb-ts` client handles graph queries but you cannot use it to run entity extraction. The entity extraction pipeline must live in the Python sidecar.

### Important

6. **Community is small.** 1,500 GitHub stars, thin Stack Overflow presence. Bug resolution depends heavily on Discord and direct GitHub issues. The Graphiti (Zep) project is a more established graph memory layer built on FalkorDB — monitor it as a higher-level abstraction.

7. **Next-gen rewrite instability.** The Rust rewrite (`falkordb-rs-next-gen`) is pre-alpha with 8 stars. The current Redis-module architecture is production stable but may be deprecated in 1-2 years as the Rust version matures. Architecture migration cost is unknown.

8. **Entity deduplication is hard.** Knowledge graph quality degrades rapidly without entity resolution ("Bitcoin", "BTC", "bitcoin" are the same entity). The GraphRAG-SDK handles this to some degree via ontology-constrained extraction, but on noisy documents with local LLMs, expect duplicate entity nodes. Plan for a periodic deduplication job from the start.

9. **Graph schema evolution.** Changing your entity/relationship schema after graph population requires either migration scripts or full repopulation. Define your ontology carefully before initial ingestion. Unlike Qdrant where you can re-embed with a new model, graph schema changes are structural.

10. **falkordb-ts API maturity.** The README acknowledges the API is still evolving. Version 6.x has breaking changes from 5.x. Pin the version in `pyproject.toml`/`package.json` and review release notes before any upgrade.

---

## Recommended Stack Addition

**Add FalkorDB to The Attic AI stack as follows:**

| Component | Decision |
|---|---|
| Graph database | FalkorDB v4.16.x (`falkordb/falkordb-server` Docker image) |
| TypeScript client | `falkordb` npm package v6.6.2 (99.4% TypeScript) |
| Entity extraction | Extend existing Python ZIM sidecar with `graphrag_sdk` + Ollama |
| Redis strategy | Second Redis container on port 6380; BullMQ Redis stays on 6379 |
| Query pattern | Parallel vector (Qdrant) + graph (FalkorDB) with RRF fusion |
| RAM allocation | 2-2.5GB for FalkorDB on 16GB+ devices; skip on 8GB devices |

**Hardware floor:** Do not add FalkorDB on 8GB RAM devices. The combined footprint of Ollama (4-8GB depending on model), Qdrant, MySQL, two Redis instances, and the AdonisJS server is already at the limit. 16GB is the practical minimum for FalkorDB integration. Make it a configuration-gated feature.

---

## Open Questions

1. **Ollama entity extraction viability** — Can llama3.1:8b (the best 8B model for structured output) reliably extract entities and relationships from unstructured documents? This needs a spike, not an assumption. Expected failure mode: hallucinated relationships, inconsistent entity naming.

2. **GraphRAG-SDK v2 vs v1 stability** — `GraphRAG-SDK-v2` exists as a separate repo from `GraphRAG-SDK`. Which is the recommended path? The docs site references v1 (`docs.falkordb.com/genai-tools/graphrag-sdk.html`), but v2 is newer. Clarify before implementation.

3. **Graphiti as an alternative to raw GraphRAG-SDK** — Zep's Graphiti library runs on top of FalkorDB and provides a higher-level "agentic memory" abstraction (episodic + semantic graph). It may offer better entity deduplication and temporal awareness than building entity extraction from scratch. Evaluate as an alternative to the raw GraphRAG-SDK.

4. **FalkorDB vs Qdrant vector index on graph nodes** — FalkorDB supports vector similarity within graph queries. Should entity embeddings live in FalkorDB or Qdrant? Current recommendation: Qdrant for all vector search, FalkorDB for all graph traversal. Mixing creates operational complexity.

5. **Schema design first** — What entity types and relationship types should The Attic AI's knowledge graph contain? (e.g., Person, Organization, Concept, Document, Topic — with relationships: MENTIONS, RELATED_TO, AUTHORED_BY, etc.) This is a product decision that blocks implementation.

---

## Sources

### FalkorDB Core
- [FalkorDB GitHub (main repo)](https://github.com/FalkorDB/FalkorDB) — v4.16.6, 1.5k stars
- [FalkorDB Docs: Docker deployment](https://docs.falkordb.com/operations/docker.html)
- [FalkorDB Docs: License (SSPL)](https://docs.falkordb.com/license.html)
- [FalkorDB Docs: Cypher known limitations](https://docs.falkordb.com/cypher/known-limitations.html)
- [FalkorDB v4.8: 7x memory efficiency vs Neo4j](https://www.falkordb.com/news-updates/v4-8-7x-more-efficient/)
- [falkordb-ts TypeScript client (GitHub)](https://github.com/FalkorDB/falkordb-ts)
- [falkordb npm package](https://www.npmjs.com/package/falkordb)
- [FalkorDB Docker Hub image](https://hub.docker.com/r/falkordb/falkordb)

### GraphRAG and Knowledge Graph RAG
- [FalkorDB GraphRAG-SDK (GitHub)](https://github.com/FalkorDB/GraphRAG-SDK)
- [FalkorDB GraphRAG-SDK Docs](https://docs.falkordb.com/genai-tools/graphrag-sdk.html)
- [GraphRAG-SDK Ollama + Azure support announcement](https://www.falkordb.com/news-updates/graphrag-sdk-ollama-azure-openai-support/)
- [graphrag-sdk on PyPI](https://pypi.org/project/graphrag-sdk/)
- [Microsoft GraphRAG official docs](https://microsoft.github.io/graphrag/)
- [GraphRAG accuracy benchmark: FalkorDB vs vector RAG](https://www.falkordb.com/blog/graphrag-accuracy-diffbot-falkordb/)
- [arXiv 2507.03226: Practical GraphRAG hybrid retrieval](https://arxiv.org/abs/2507.03226)
- [Qdrant + Neo4j GraphRAG example](https://qdrant.tech/documentation/examples/graphrag-qdrant-neo4j/)
- [Memgraph: Why HybridRAG](https://memgraph.com/blog/why-hybridrag)

### Comparisons
- [FalkorDB vs Neo4j for AI](https://www.falkordb.com/blog/falkordb-vs-neo4j-for-ai-applications/)
- [FalkorDB vs Neo4j benchmarks](https://www.falkordb.com/blog/graph-database-performance-benchmarks-falkordb-vs-neo4j/)
- [Apache AGE GitHub](https://github.com/apache/age)
- [PostgreSQL graph with Apache AGE analysis](https://medium.com/@sjksingh/postgresql-showdown-complex-joins-vs-native-graph-traversals-with-apache-age-78d65f2fbdaa)
- [Memgraph storage memory usage docs](https://memgraph.com/docs/fundamentals/storage-memory-usage)
- [GitLab knowledge graph: evaluating Neo4j, FalkorDB, Memgraph](https://gitlab.com/gitlab-org/rust/knowledge-graph/-/work_items/254)

### Related Integrations
- [Graphiti (Zep) + FalkorDB getting started](https://www.falkordb.com/blog/graphiti-get-started/)
- [FalkorDB LangChain JS/TS integration](https://www.falkordb.com/blog/falkordb-langchain-js-ts-integration/)
- [LangChain FalkorDB integration docs](https://docs.langchain.com/oss/javascript/integrations/tools/falkordb)
- [FalkorDB + Graphiti MCP knowledge graph](https://www.falkordb.com/blog/mcp-knowledge-graph-graphiti-falkordb/)
- [FalkorDB graph database guide for AI architects 2026](https://www.falkordb.com/blog/graph-database-guide/)
