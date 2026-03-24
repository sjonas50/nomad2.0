# The Attic AI — COOP Features Build Plan

Extends the completed Phases 0-7 build plan. Each phase has a **test gate** that must pass before advancing. Complexity: S = hours, M = 1-2 days, L = 3+ days.

**Target users:** Preppers, government clients (ICS/NIMS), enterprise (BCP). Core value prop: persist knowledge and comms when internet is down after a natural disaster.

**Target hardware:** M4 MacBook Pro (16GB+ unified memory, Apple Silicon Metal GPU). `full` Docker Compose profile is always viable.

Research: `docs/research-coop-features.md`
Architecture: `docs/architecture-coop.md`

---

## Phase 8: ICS & BCP Data Model + Playbooks

**Goal:** Structured incident and business continuity management the AI can reason over. Pure backend — no new external deps.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 8.1 | Incident model + migration — `name`, `type` (enum: natural_disaster/infrastructure_failure/security/medical/cyber/pandemic/other), `status` (declared/active/contained/closed), `iap_period`, `incident_commander_id` FK, `declared_at`, `closed_at` | `app/models/incident.ts`, `database/migrations/*_create_incidents_table.ts` | S |
| 8.2 | EssentialFunction model — `incident_id` FK, `name`, `priority` (1/2/3 FEMA tiers), `status` (nominal/degraded/failed), `primary_personnel` JSON, `alternate_personnel` JSON, `procedures` JSON, `recovery_time_objective` (minutes, for BCP) | `app/models/essential_function.ts`, `database/migrations/*_create_essential_functions_table.ts` | S |
| 8.3 | Resource model — `type`, `name`, `quantity`, `latitude`, `longitude`, `status` (available/assigned/out_of_service), `assigned_incident_id` FK nullable, `expiry_date` nullable (for consumables tracking) | `app/models/resource.ts`, `database/migrations/*_create_resources_table.ts` | S |
| 8.4 | ActivityLog model — **append-only** (no UPDATE, corrections via `corrects_id` self-ref), `incident_id` FK, `timestamp`, `actor_id` FK, `activity` text, `source` (manual/voice/ai_extracted/mesh), `category` (decision/observation/communication/resource_change) | `app/models/activity_log.ts`, `database/migrations/*_create_activity_logs_table.ts` | S |
| 8.5 | PersonnelStatus model — `user_id` FK, `incident_id` FK, `status` (available/deployed/injured/unaccounted), `location_text`, `latitude`, `longitude`, `checked_in_at`, `checked_in_via` (manual/mesh/voice), `assignment` text nullable | `app/models/personnel_status.ts`, `database/migrations/*_create_personnel_statuses_table.ts` | S |
| 8.6 | CommunicationTree model — `incident_id` FK nullable (org-wide if null), `name`, `tree_data` JSON (ordered contact list with primary/alternate methods: radio freq, mesh channel, phone, email), `type` (pace/calldown/escalation) | `app/models/communication_tree.ts`, `database/migrations/*_create_communication_trees_table.ts` | S |
| 8.7 | ICSService — `declareIncident()`, `updateStatus()`, `logActivity()`, `checkInPersonnel()`, `buildContextBlock()` (formats active incident + functions + recent log for LLM system prompt), `getIncidentSummary()`, `generateAAR()` (AI-synthesized after-action report from activity logs) | `app/services/ics_service.ts` | M |
| 8.8 | Seed playbook templates — **ICS:** PAR (ICS-211), Resource Request (ICS-213RR), Activity Log (ICS-214), PACE Plan, Emergency Comms. **BCP:** Business Impact Analysis template, Recovery Priority Matrix, Communication Cascade, IT Disaster Recovery checklist. Store as prompt_templates with `category: 'ics'` or `category: 'bcp'` | `database/seeders/ics_templates_seeder.ts` | M |
| 8.9 | IncidentController + Inertia pages — Incident dashboard (active incidents, essential function status grid with color-coded priority, recent activity log, personnel accountability count), incident declaration form, PAR check-in form, communication tree viewer, AAR generation button | `app/controllers/incident_controller.ts`, `inertia/pages/incidents.tsx`, `inertia/pages/incident_detail.tsx` | M |
| 8.10 | AI integration — Update AIChatOrchestrator to inject ICS context block when an active incident exists. Add `incident_query` intent to classifier. Add ICS tools to ToolRegistry: `declare_incident`, `log_activity`, `check_in`, `resource_status`, `generate_aar` (admin/operator roles) | Update `app/services/ai_chat_orchestrator.ts`, `app/tools/ics_*.ts` | M |

**Test gate:**
```bash
node ace test --files="tests/unit/ics.spec.ts"     # ICS models, service, context block, BCP templates
npx tsc --noEmit                                    # Zero type errors
```

---

## Phase 9: Voice Capture & Structured Extraction

**Goal:** Record audio → offline transcription → structured ICS activity log entries. Critical for field use when typing isn't practical (hands occupied, high-stress, radio-style reporting).

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 9.1 | Install whisper.cpp binary in Python sidecar Dockerfile — download pre-built binary + `base.en` model (default for M4 MacBook Pro, configurable via `WHISPER_MODEL` env var). Metal acceleration enabled by default on Apple Silicon. | `sidecar/Dockerfile` | S |
| 9.2 | `/transcribe` endpoint in Python sidecar — accepts WAV/WebM upload, runs whisper.cpp via subprocess, returns transcript with timestamps and confidence scores | `sidecar/main.py`, `sidecar/extractors/whisper.py` | M |
| 9.3 | VoiceCaptureService in AdonisJS — calls sidecar `/transcribe`, passes transcript to Ollama for structured extraction (JSON schema: `{ activity, actor, timestamp, incident_ref, category, resources_mentioned }`), creates ActivityLog entry with `source: 'voice'` | `app/services/voice_capture_service.ts` | M |
| 9.4 | Browser audio recording component — MediaRecorder API, record/stop/upload to `/api/voice/capture`, show transcript + extracted fields with edit-before-save, push-to-talk mode for radio-style input | `inertia/components/voice_recorder.tsx` | M |
| 9.5 | VoiceController — `POST /api/voice/capture` (upload + transcribe + extract), `GET /api/voice/transcriptions` (recent list), `POST /api/voice/batch` (upload multiple recordings) | `app/controllers/voice_controller.ts` | S |
| 9.6 | Wire into incident pages — voice record button on incident detail and activity log, auto-populate activity log from extracted fields, voice note attached to activity log entry | Update `inertia/pages/incident_detail.tsx` | S |

**Test gate:**
```bash
node ace test --files="tests/unit/voice.spec.ts"    # VoiceCaptureService, extraction schema validation
npx tsc --noEmit
```

---

## Phase 10: Data Sync & Sneakernet

**Goal:** Multiple disconnected Attic instances can share state. USB sneakernet is the primary sync method (internet is down). WiFi sync when nodes are co-located. Mesh for urgent delta notifications.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 10.1 | Install `yjs`, `y-leveldb`, `y-websocket` — configure y-websocket as a separate Node.js process (port 4444), LevelDB persistence at `storage/yjs` | `sync/server.ts`, `sync/package.json`, update `docker-compose.yml` | M |
| 10.2 | SyncService — bridge between MySQL models and Yjs documents. Map synced models (incidents, activity_logs, personnel_statuses, resources, communication_trees, essential_functions) to `Y.Map` and `Y.Array` structures. Bidirectional: MySQL writes → Yjs ops, Yjs remote ops → MySQL upserts. Conflict resolution: append-only logs merge naturally, last-writer-wins for status fields with timestamp tiebreaker. | `app/services/sync_service.ts` | L |
| 10.3 | **Sneakernet bundle** — `node ace sync:export --out /path/to/bundle.attic` exports a full portable package: Yjs state snapshot + MySQL dump (gzipped) + Qdrant collection snapshot + knowledge source files manifest. `node ace sync:import --from /path/to/bundle.attic` applies the bundle. Single `.attic` file (tar.gz). This is the **primary offline sync mechanism**. | `commands/sync_export.ts`, `commands/sync_import.ts`, `app/services/bundle_service.ts` | L |
| 10.4 | Sneakernet UI — "Export Data Bundle" and "Import Data Bundle" on admin page. Show bundle contents preview before import. Progress bar for large bundles. Also accessible from incident detail page ("Share this incident"). | `app/controllers/sync_controller.ts`, update admin UI | M |
| 10.5 | Meshtastic sync transport — Exchange Yjs state vector hashes over mesh (compact, fits in 250-byte packets). On hash mismatch, send text summary of what changed ("3 new activity logs, 2 personnel check-ins"). Full sync waits for WiFi or sneakernet. Store pending sync state in Redis. | `app/services/mesh_sync_transport.ts` | M |
| 10.6 | WiFi peer discovery — When WiFi AP is active or nodes are on same network, auto-discover other Attic instances via mDNS (`_attic._tcp`). Connect y-websocket for real-time sync. Show discovered peers in UI. | `app/services/peer_discovery_service.ts` | M |
| 10.7 | Sync status dashboard — Show known peers (discovered + manually added), last sync timestamp per peer, pending ops count, conflict log, bundle history (exports/imports with timestamps) | `inertia/components/sync_status.tsx`, update admin dashboard | S |
| 10.8 | Yjs garbage collection — Enable `ydoc.gc = true`, implement periodic snapshot+reset cycle (hourly). Archive old snapshots. Monitor op history size. | Update `sync/server.ts`, `app/services/sync_service.ts` | S |

**Test gate:**
```bash
node ace test --files="tests/unit/sync.spec.ts"     # Yjs doc creation, MySQL↔Yjs bridge, bundle export/import, peer discovery
npx tsc --noEmit
```

---

## Phase 11: Situational Awareness Map

**Goal:** Live GPS tracking from Meshtastic nodes on an offline MapLibre map. Resource and personnel plotting for operational awareness.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 11.1 | Extend Python sidecar — poll Meshtastic node positions via `meshtastic` Python library (`--host` serial or TCP), push to new `/api/positions` SSE endpoint. Store in `mesh_nodes` table (already exists). | `sidecar/services/position_tracker.py`, update `sidecar/main.py` | M |
| 11.2 | PositionService in AdonisJS — WebSocket endpoint (`/ws/positions`) broadcasting position updates to connected clients. Stores position history in FalkorDB: `(Node)-[:AT {timestamp}]->(GeoPoint)` | `app/services/position_service.ts` | M |
| 11.3 | MapLibre GL JS map page — PMTiles base layer, live node markers with callsigns, track history lines, auto-center on active nodes. Install `maplibre-gl` as npm dep. Layer toggles: mesh nodes, resources, personnel, geofences. | `inertia/pages/map.tsx`, `inertia/components/map_view.tsx` | M |
| 11.4 | Geofencing — Define zones as GeoJSON polygons (stored in MySQL `geofences` table), check positions against zones with `@turf/boolean-point-in-polygon`, alert on enter/exit. Zone types: safe_area, hazard, rally_point, exclusion. | `app/services/geofence_service.ts`, `app/models/geofence.ts`, `database/migrations/*_create_geofences_table.ts` | M |
| 11.5 | Resource + personnel tracking on map — Plot resources with location, color-code by status, filter by incident. Plot personnel last-known positions from PersonnelStatus. Click marker → detail card with assignment and check-in time. | Update `inertia/pages/map.tsx` | S |

**Test gate:**
```bash
node ace test --files="tests/unit/map.spec.ts"      # Geofence point-in-polygon, position service
npx tsc --noEmit
```

---

## Phase 12: OpenTAKServer Integration

**Goal:** Interoperate with the TAK ecosystem. Government and military users already use ATAK/iTAK — bridging into their tooling makes The Attic AI a force multiplier rather than a standalone silo.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 12.1 | Add OpenTAKServer to Docker Compose — Python/Flask, Apple Silicon compatible, ports 8089 (CoT TCP), 8443 (CoT TLS), 8080 (web UI). Config-gated via `tak` profile. Persistent data volume. | Update `docker-compose.yml` | S |
| 12.2 | CoTService — Parse incoming CoT XML events (PLI position `a-f-G-U-C`, GeoChat messages `b-t-f`). Extract type, callsign, lat/lon, remarks. Use `fast-xml-parser` npm. Only standard CoT types — no vendor extensions. | `app/services/cot_service.ts` | M |
| 12.3 | CoT TCP listener — Connect to OpenTAKServer's CoT feed, parse events, update `mesh_nodes` positions (unified position table), create activity log entries for GeoChat messages with `source: 'tak'` | `app/services/cot_listener.ts` | M |
| 12.4 | CoT publisher — Publish Meshtastic mesh node positions as CoT PLI events to OpenTAKServer. Publish incident declarations as CoT alert events. Convert lat/lon/callsign to `<event>` XML. | `app/services/cot_publisher.ts` | M |
| 12.5 | TAK status panel + map integration — Show connected TAK clients, recent CoT events, bridge status on admin dashboard. TAK client positions appear on the MapLibre map (Phase 11) as a distinct layer. | Update `inertia/pages/admin/dashboard.tsx`, update `inertia/pages/map.tsx` | S |

**Test gate:**
```bash
node ace test --files="tests/unit/tak.spec.ts"      # CoT XML parsing, PLI/GeoChat extraction, event generation
npx tsc --noEmit
```

---

## Phase 13: Packaging & Deployment

**Goal:** Self-contained deployment for M4 MacBook Pro. Zero-internet install path. Portable distribution.

| # | Task | Files | Complexity |
|---|------|-------|------------|
| 13.1 | macOS install script — Homebrew prerequisite check, Docker Desktop detection, Apple Silicon optimizations (Metal GPU env vars for Ollama), `full` profile as default, auto-detect memory for model recommendations | Update `install.sh` | M |
| 13.2 | Offline install bundle — Pre-package Docker images (`docker save`), Ollama models, npm dependencies, and a PMTiles base map into a single distributable archive. `install.sh --offline /path/to/bundle` installs without any network access. This is critical for disaster prep: install BEFORE the disaster hits, or distribute to field teams via USB. | `scripts/build_offline_bundle.sh`, update `install.sh` | L |
| 13.3 | Ollama model + whisper.cpp auto-config — Auto-detect available memory via `sysctl hw.memsize`, select model tier (7B for 16GB, 13B for 24GB+, 32B for 48GB+), set `WHISPER_MODEL` to `base.en` (16GB) or `small.en` (24GB+). Metal acceleration enabled by default. | Update `app/services/onboarding_service.ts`, `scripts/detect_hardware.sh` | S |
| 13.4 | Custom ZIM export — Export Attic AI knowledge base to a ZIM file for portable distribution to Kiwix readers. Python sidecar endpoint `/export/zim` using `zimscraperlib`. Useful for distributing institutional knowledge to field teams who don't have The Attic AI installed. | `sidecar/exporters/zim_exporter.py`, update `sidecar/main.py` | M |
| 13.5 | Encryption at rest — Encrypted sneakernet bundles (AES-256-GCM, passphrase-derived key via scrypt). Option to encrypt MySQL at-rest via `innodb_encrypt_tables`. Encrypted Qdrant snapshots in bundles. Gov/enterprise requirement. | Update `app/services/bundle_service.ts`, `commands/sync_export.ts` | M |
| 13.6 | Deployment guide — macOS-specific setup, Docker Desktop resource allocation, Meshtastic USB serial permissions, launchd auto-start, offline install procedure, field team distribution workflow, encryption key management | `docs/deployment-guide.md` | S |

**Test gate:**
```bash
node ace test                                        # Full suite green
./install.sh --dry-run                               # Install script validates
npx tsc --noEmit
```

---

## Summary

| Phase | Tasks | Focus | New Dependencies |
|-------|-------|-------|-----------------|
| 8 | 10 | ICS + BCP data model, playbooks, AI tools, comm trees | None |
| 9 | 6 | Voice capture, whisper.cpp, structured extraction | whisper.cpp binary |
| 10 | 8 | **Yjs CRDT sync, sneakernet bundles, peer discovery** | `yjs`, `y-leveldb`, `y-websocket` |
| 11 | 5 | MapLibre map, GPS tracking, geofencing | `maplibre-gl`, `@turf/boolean-point-in-polygon` |
| 12 | 5 | OpenTAKServer, CoT bridge | `fast-xml-parser`, OpenTAKServer Docker image |
| 13 | 6 | Offline install, encrypted bundles, ZIM export | `zimscraperlib` (Python) |
| **Total** | **40** | | |

## Execution Order & Rationale

```
Phase 8  ──→  Phase 9  ──→  Phase 10  ──→  Phase 13
(ICS/BCP)    (Voice)       (Sync/USB)     (Packaging)
                              │
                              ├──→  Phase 11 (Map)     ← can parallel with 12
                              └──→  Phase 12 (TAK)     ← can parallel with 11
```

**Why this order:**
1. **Phase 8 first** — ICS/BCP data model is the foundation everything syncs, maps, and voices into
2. **Phase 9 next** — voice capture feeds activity logs (Phase 8). Field operators need hands-free input.
3. **Phase 10 elevated to third** — sync and sneakernet are the #1 differentiator for the offline-first use case. If internet is down and you have two EOCs, USB bundle exchange is how they share state. This is core product, not infrastructure.
4. **Phases 11-12 can parallel** — map and TAK are independent capabilities that both consume position data
5. **Phase 13 last** — packaging requires all features to be stable. The offline install bundle and encrypted sneakernet are the final polish for field deployment.

## Key Design Decisions

- **Sneakernet bundles are first-class, not a fallback.** The `.attic` bundle format is a single encrypted tar.gz containing everything needed to sync state between two disconnected nodes. This is likely the most-used sync method in a disaster scenario.
- **BCP templates alongside ICS.** Government clients speak ICS. Enterprise clients speak BCP. Both get native playbook templates.
- **Append-only activity logs.** Crisis data must never be silently overwritten. Corrections are new log entries referencing the original. This also makes CRDT merge trivial — append-only logs converge naturally.
- **Communication trees are a first-class model.** PACE plans (Primary, Alternate, Contingency, Emergency) are the backbone of disaster comms. Storing them structured (not as free text) lets the AI surface the right contact method when a channel goes down.
- **Encrypted bundles for gov/enterprise.** USB drives get lost. Sneakernet data must be encrypted at rest with a shared passphrase. AES-256-GCM with scrypt key derivation.
