# Code Review Report
**Date:** 2026-03-23
**Status:** PASS WITH NOTES

## Critical Issues (must fix)

1. **Hardcoded APP_KEY in `.env`** — `/Users/sjonas/nomad2.0/.env:5` contains `APP_KEY=SoRdLitC8YIqp8TO8QHYoGG_z1hYD3vr`. This is a session signing secret committed to the repo. Rotate immediately and ensure `.env` is never committed (it IS in `.gitignore`, but the file was committed at some point).

2. **Command injection in `BackupService.backupMysql()`** — `/Users/sjonas/nomad2.0/app/services/backup_service.ts:36`. The `mysqldump` command is built via string interpolation from environment variables. If `DB_PASSWORD` or `DB_DATABASE` contain shell metacharacters, this is exploitable. Same issue at line 168 (`restoreMysql`). Use `execFile` with argument arrays instead of `exec` with string concatenation.

3. **Command injection in `WifiApService`** — `/Users/sjonas/nomad2.0/app/services/wifi_ap_service.ts:131`. The `interface` config value is interpolated directly into shell commands (`sudo ip addr add ... dev ${this.config.interface}`). A malicious config value could execute arbitrary commands. Use `execFile` or validate the interface name against a strict pattern.

4. **Path traversal in ZIM extraction endpoint** — `/Users/sjonas/nomad2.0/sidecar/main.py:37` accepts `file_path` from the request body with no validation. An attacker could read any file accessible to the sidecar container (e.g., `/etc/passwd`). Restrict to an allowed directory.

5. **No admin role enforcement on admin API routes** — `/Users/sjonas/nomad2.0/start/routes.ts:88-100`. Comment says "admin role checked in controller" but `AdminController` methods (`listUsers`, `updateUser`, `deleteUser`, `auditLogs`, `listTemplates`, `updateTemplate`, `listBackups`, `createBackup`, `restoreBackup`, `deleteBackup`) never check `auth.user.role`. Any authenticated user can manage users, delete accounts, create/restore backups, and modify prompt templates.

6. **Cypher injection in `GraphService.addRelationship()`** — `/Users/sjonas/nomad2.0/app/services/graph_service.ts:138`. The `relType` parameter is interpolated directly into the Cypher query string (`` `MERGE (a)-[r:${relType} ...]` ``). If `relType` comes from untrusted input (entity extraction via LLM), this allows Cypher injection. Validate `relType` against an allowlist or sanitize to alphanumeric + underscore.

## Warnings (should fix)

1. **CSP disabled in Shield config** — `/Users/sjonas/nomad2.0/config/shield.ts:9` has `csp.enabled: false`. The custom CSP header in `SecurityMiddleware` partially compensates but includes `'unsafe-inline'` for both scripts and styles, weakening XSS protection.

2. **`/setup` route has no auth guard** — `/Users/sjonas/nomad2.0/start/routes.ts:28-29`. While the controller checks `userCount > 0`, a race condition could allow multiple admin accounts if concurrent requests hit `/setup` simultaneously. Add a DB-level unique constraint or transaction.

3. **`/api/health` has no auth** — `/Users/sjonas/nomad2.0/start/routes.ts:47`. Exposes server liveness information to unauthenticated users.

4. **Python sidecar dependencies not pinned to exact versions** — `/Users/sjonas/nomad2.0/sidecar/pyproject.toml:6-11`. Uses `>=` ranges instead of `==` pins (e.g., `fastapi>=0.115.0`). This allows supply chain drift.

5. **Node.js dependencies use `^` ranges** — `/Users/sjonas/nomad2.0/package.json` uses caret ranges for all dependencies. `package-lock.json` mitigates this, but pinning is safer for reproducible builds.

6. **Download tool does not validate URL (SSRF)** — `/Users/sjonas/nomad2.0/app/tools/download_content.ts:22`. The `url` parameter is passed directly to `DownloadService.download()` without calling `SecurityMiddleware.isUrlSafe()`. An operator-role user could trigger downloads from internal services.

7. **Library download endpoint does not validate URL** — `/Users/sjonas/nomad2.0/app/controllers/library_controller.ts:45`. Same SSRF issue: user-supplied `url` is passed directly to `DownloadService`.

8. **File upload size mismatch** — SecurityMiddleware limits to 100MB (`/Users/sjonas/nomad2.0/app/middleware/security_middleware.ts:40`) but `KnowledgeController.upload()` allows 500MB (`/Users/sjonas/nomad2.0/app/controllers/knowledge_controller.ts:37`). The middleware check uses `content-length` header which can be spoofed.

9. **`install.sh` uses `eval`** — `/Users/sjonas/nomad2.0/install.sh:29`. The `run()` function uses `eval "$@"` which is dangerous if arguments contain shell metacharacters. Use `"$@"` directly.

10. **Bare `except` / silent exception swallowing in Python sidecar** — `/Users/sjonas/nomad2.0/sidecar/extractors/entities.py:151` catches all exceptions from Ollama classification and silently passes, losing diagnostic information. Should at least log.

11. **Services controller passes Docker container ID from URL params without validation** — `/Users/sjonas/nomad2.0/app/controllers/services_controller.ts:31-64`. The `params.id` is passed directly to Docker API. Should validate format (hex string or container name pattern).

12. **`ALLOWED_UPLOAD_TYPES` check in SecurityMiddleware is declared but never enforced** — `/Users/sjonas/nomad2.0/app/middleware/security_middleware.ts:31-38`. The `isAllowedUploadType` static method exists but is never called in the middleware `handle()` method or anywhere else.

13. **Rate limiter memory leak** — `/Users/sjonas/nomad2.0/app/middleware/security_middleware.ts:8`. `rateLimitBuckets` Map grows unboundedly. No cleanup of stale entries. On a long-running server, this will consume increasing memory.

14. **`knowledge_sources` not scoped to user** — `/Users/sjonas/nomad2.0/app/controllers/knowledge_controller.ts:110-124`. `show`, `reEmbed`, and `destroy` endpoints use `findOrFail(params.id)` without filtering by `userId`. Any authenticated user can view/modify/delete any user's knowledge source.

## Suggestions (nice to have)

1. `.env.example` at line 13 contains a default password `attic_password` — consider removing default credentials from the example file to avoid accidental use in production.

2. The `EmbeddingService.truncateToTokenLimit()` uses a rough 4-chars-per-token estimate. Consider using a proper tokenizer for nomic-embed-text for accuracy.

3. The `AIChatOrchestrator` is instantiated fresh on every request (`new AIChatOrchestrator()` in `ChatController.stream`). This creates new `OllamaService`, `EmbeddingService`, and `VectorStoreService` instances each time. Consider using AdonisJS IoC container for singleton services.

4. No `conftest.py` or test files exist for the Python sidecar.

5. The `functional/` test directory is empty.

6. Consider adding `Permissions-Policy` header to security middleware.

7. The `migrate_v1.ts` script accepts `--source-password` via CLI argument, which is visible in process listings. Consider reading from env or a file.

8. Session age is 2 hours (`/Users/sjonas/nomad2.0/config/session.ts:19`). For an offline tool this may be too short — consider making it configurable.

9. The `GraphService.addEntity()` method at line 99-100 builds dynamic Cypher SET clauses from property keys. While the values are parameterized, the keys are not — property key injection is possible if keys contain special characters.

10. Missing `JSON` content-type validation on the `stream` endpoint body — `request.only()` trusts the bodyparser but doesn't use VineJS validation.

## Metrics
- Files reviewed: 73 (all non-node_modules TS, TSX, PY, config, Docker, shell)
- Test count: 9 test files, ~1038 lines total, 0 Python tests
- Ruff violations: not run (TypeScript-primary project)
- Security issues: 6 critical, 14 warning
