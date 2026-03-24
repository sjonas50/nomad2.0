# Research: Offline/Air-Gapped Distribution for The Attic AI

## Executive Summary

The optimal distribution strategy for The Attic AI on M4 MacBook Pro is a **shell script + `docker save` tarball bundle**, delivered as a self-extracting `.command` file (double-clickable on macOS) or wrapped in a signed `.pkg` installer. Docker Desktop is the only prerequisite. The total bundle — base images only, no Ollama models — is approximately 13–15 GB compressed; Ollama models must be handled separately as a supplemental bundle or seeded into the Ollama Docker volume at first run. A `.pkg` wrapper adds polish for non-technical users but is optional complexity for v1.

---

## Problem Statement

The Attic AI runs as a 6–8 container Docker Compose stack (MySQL 8.0, Redis, Ollama, Qdrant, AdonisJS app, optional FalkorDB + Python sidecar). Target users — preppers, government operators, enterprise IT — may not have git, Node.js, Homebrew, or any developer tooling installed. The device will operate offline after initial setup. The distribution artifact must: bundle all Docker images, handle first-run migrations and seeding, pull Ollama models once (or ship them), and be operable by a non-technical user who can double-click a file and wait.

---

## Technology Evaluation

### Option A: Shell Script + `docker save` Tarball — RECOMMENDED

**How it works:** All images are saved to a single multi-image tarball via `docker save`. A companion shell script handles `docker load`, `docker compose up`, migrations, and seeding. On macOS, a `.command` file (executable shell script) opens in Terminal when double-clicked — no developer tools required.

**Image size reality check** (from live Docker environment on this machine):

| Image | Size |
|---|---|
| ollama/ollama | ~8.7 GB |
| the-attic-ai-admin (AdonisJS app) | ~2.45 GB |
| mysql:8.0 | ~1.08 GB |
| falkordb/falkordb | ~1.03 GB |
| qdrant/qdrant:v1.16 | ~289 MB |
| redis:7-alpine | ~62 MB |
| Python sidecar (FastAPI) | ~200–400 MB est. |

**Total uncompressed (full profile):** ~14–15 GB. **Compressed with `gzip -9`:** ~11–13 GB. Without FalkorDB/sidecar (default profile): ~12–13 GB uncompressed.

**Ollama models are not included in `docker save`.** Ollama stores models in a Docker named volume (`ollama:/root/.ollama`), not inside the image layer. This is a critical distinction — models must be distributed separately.

**Ollama model distribution options:**
1. **Separate model tarball** — export the populated `ollama` Docker volume using `docker run --rm -v ollama:/data busybox tar -czf - /data > ollama-models.tar.gz`. User extracts before first run. A 7B model (e.g., `mistral:7b-instruct-q4_K_M`) is ~4.1 GB GGUF compressed.
2. **First-run pull script** — if internet is available at initial setup, the `postinstall.sh` calls `docker exec ollama ollama pull <model>`. Simpler but requires internet once.
3. **Bake models into a custom Ollama image** — `FROM ollama/ollama`, `RUN ollama serve & sleep 5 && ollama pull model`. Bloats the image but truly self-contained. Not recommended for multiple models.

**Rating:**
- Non-technical UX: 7/10 (Terminal window, but guided output)
- Offline capability: 10/10
- File size: unavoidable — all approaches share this constraint
- First-run experience: 8/10 with a well-written script
- Update mechanism: re-ship updated tarball; version-check script can detect stale images

**Verdict: Recommended for v1.** Lowest complexity, fully testable, no tooling dependencies beyond Docker Desktop.

---

### Option B: macOS `.pkg` Installer — CONSIDER

**How it works:** `pkgbuild` (ships with macOS, no Xcode required) wraps a payload directory + `postinstall` script into a clickable installer. The installer GUI handles user prompting. Requires an Apple Developer ID certificate for Gatekeeper signing (~$99/year).

**What the `.pkg` does:**
1. Copies the `docker-compose.yml`, `.env.example`, and the images tarball to `/Applications/TheAtticAI/` (or `~/Applications/`)
2. `postinstall` script runs `docker load`, `docker compose up`, migrations

**Key constraints:**
- `postinstall` runs as root with a restricted PATH — must use absolute paths (`/usr/local/bin/docker`), and Docker Desktop's socket may not be accessible to root during install. This is a known failure mode.
- The pkg payload + tarball must be co-located — the `.pkg` will be 13+ GB. Distribution via USB drive is fine; via web is impractical.
- Unsigned `.pkg` files trigger Gatekeeper and require the user to right-click → Open, which is non-obvious for non-technical users.

**Rating:**
- Non-technical UX: 9/10 (familiar installer flow) — but only if signed
- Offline capability: 10/10
- First-run experience: 8/10
- Update mechanism: ship new `.pkg`

**Verdict: Consider for v1.5 or enterprise deployments requiring MDM.** The Docker socket / root permission issue in `postinstall` is solvable but adds friction. Sign the package or users will hit Gatekeeper warnings.

---

### Option C: Self-Extracting Archive (`.command` file inside a `.dmg`) — CONSIDER

**How it works:** Package everything inside a `.dmg` (disk image). User mounts it, sees a friendly window with an icon for "Install The Attic AI.command". Double-clicking opens Terminal and runs the install script. `.dmg` can be signed and notarized without a full app bundle.

This is the pattern used by many macOS developer tools (e.g., older Vagrant installers, some database GUIs).

**Advantages over raw `.pkg`:**
- No `postinstall` root-context Docker socket issues — the `.command` runs as the user
- Easier to debug and iterate — the script is visible and editable
- `hdiutil create` to build the `.dmg` is straightforward
- Can be notarized with `xcrun notarytool` for Gatekeeper trust

**Rating:**
- Non-technical UX: 8/10 (mounts a disk image, familiar on Mac)
- Offline capability: 10/10
- First-run experience: 8/10
- Update mechanism: ship new `.dmg`

**Verdict: Good v1.5 option. Cleaner than raw tarball, avoids the root-context PKG pitfall.**

---

### Option D: Electron/Tauri GUI Wrapper — AVOID

Wrapping a shell installer in Electron (or Tauri) to provide a progress-bar GUI sounds appealing but introduces massive overhead: ~100–200 MB Electron runtime, a full Node.js build pipeline, and code signing complexity. The value proposition is weak when the actual work is `docker load` (which streams progress to stdout anyway). Tauri is lighter but requires Rust toolchain for builds. Both options add maintenance burden without meaningfully improving the user experience over a well-written shell script with colored output.

**Verdict: Avoid for this use case.**

---

## Architecture Patterns Found

**Pattern 1: The "release bundle" script (most common in similar projects)**

```
attic-ai-v1.0.0/
├── install.command          # Double-clickable on macOS
├── uninstall.command
├── docker-compose.yml
├── docker-compose.override.yml.example
├── .env.example
├── images/
│   └── attic-ai-images.tar.gz   # docker save output
└── models/
    └── ollama-models.tar.gz     # ollama volume export (optional)
```

Shipped as a `.zip` or on USB drive. User unzips, double-clicks `install.command`.

**Pattern 2: Two-phase install**

Phase 1 (requires internet, done once by operator): `prepare-bundle.sh` — pulls images, saves tarball, exports Ollama volume. Ships the bundle.

Phase 2 (air-gapped target): `install.command` — loads images, starts stack, runs migrations.

This cleanly separates "bundle creation" (operator's job) from "installation" (end-user's job).

**Pattern 3: Local private registry (overkill for single-node)**

Run a `registry:2` container, push all images into it, snapshot the registry's data volume. On target, run the registry container first, then `docker compose pull` from `localhost:5000`. Adds 100 MB overhead and complexity with no benefit for single-machine deployments. Only useful for multi-node or frequent update scenarios.

---

## Key APIs and Services

**Docker CLI commands for bundle creation:**

```bash
# Save all stack images (specify explicitly, not via docker images -a which picks up junk)
docker save \
  mysql:8.0 \
  redis:7-alpine \
  ollama/ollama:latest \
  qdrant/qdrant:v1.16 \
  falkordb/falkordb:latest \
  the-attic-ai-admin:latest \
  the-attic-ai-sidecar:latest \
  | gzip -9 > attic-ai-images.tar.gz

# Export Ollama volume (models)
docker run --rm \
  -v ollama:/source \
  -v "$(pwd)/models":/dest \
  busybox tar -czf /dest/ollama-models.tar.gz -C /source .

# On target: load images
docker load < attic-ai-images.tar.gz

# On target: restore Ollama volume
docker volume create ollama
docker run --rm \
  -v ollama:/dest \
  -v "$(pwd)/models":/source \
  busybox tar -xzf /source/ollama-models.tar.gz -C /dest
```

**First-run migration sequence (in `install.command`):**

```bash
docker compose up -d mysql redis
sleep 10  # replace with health-check loop
docker compose up -d  # bring up remaining services
docker compose exec admin node ace migration:run --force
docker compose exec admin node ace db:seed
```

Use `docker compose exec` with `--no-TTY` flag in non-interactive contexts.

**`nomic-embed-text` model for Qdrant** — must be pre-pulled into the Ollama volume (768-dim embeddings). Include `nomic-embed-text:v1.5` in the Ollama model bundle. Size: ~274 MB GGUF.

---

## Known Pitfalls and Risks

**1. Platform architecture mismatch.** `docker save` saves the image as-is. If the bundle is built on an Apple Silicon Mac and loaded onto an Intel Mac (or vice versa), images may fail unless multi-platform images were pulled. Mitigation: build the bundle on the same architecture as the target, or pull both platforms explicitly with `docker pull --platform linux/arm64` and `docker pull --platform linux/amd64` before saving.

**2. Ollama models are not inside the image.** This is the #1 gotcha. `docker save ollama/ollama` does not include models — they live in a named Docker volume. The volume must be exported separately or models re-pulled on first run.

**3. `docker save` includes all layers, including intermediate build layers.** Minimize image size before bundling: run `docker image prune` and use multi-stage Dockerfiles for the AdonisJS app. The `the-attic-ai-admin:latest` image at 2.45 GB is large — a well-optimized production image should be under 500 MB.

**4. `.command` files have quarantine bit set** after download/unzip. User must right-click → Open on first run, or strip the quarantine bit during unzip. Workaround: ship a `README.txt` explaining this, or use `xattr -d com.apple.quarantine install.command` in a pre-step.

**5. Docker socket path on Apple Silicon.** Docker Desktop on Apple Silicon uses `~/.docker/run/docker.sock` or `/var/run/docker.sock` (via symlink). Scripts must not hardcode the socket path; use `docker info` to verify connectivity.

**6. MySQL cold-start timing.** MySQL takes 8–15 seconds to be ready on first boot. A `sleep 10` is fragile. Use a health-check loop:

```bash
until docker compose exec mysql mysqladmin ping -h localhost --silent; do
  echo "Waiting for MySQL..."; sleep 2
done
```

**7. Redis `maxmemory-policy`.** Already documented in CLAUDE.md — must be `noeviction`. The install script should validate this after startup:

```bash
docker compose exec redis redis-cli config get maxmemory-policy | grep -q "noeviction" || { echo "FATAL: Redis policy misconfigured"; exit 1; }
```

**8. Gatekeeper and unsigned binaries.** Any script or binary not signed with an Apple Developer ID will trigger a Gatekeeper warning. For v1, document the `xattr` workaround. For production, get the $99/year Apple Developer Program membership and sign + notarize the installer.

---

## Recommended Stack

**v1 (ship it):**

1. Build script: `scripts/build-bundle.sh` — pulls images, saves tarball, exports Ollama volume, zips everything
2. Install artifact: `attic-ai-v{VERSION}-arm64.zip` containing:
   - `install.command` (user-facing, colored output, health checks)
   - `uninstall.command`
   - `update.command` (re-runs docker load + migrations for updates)
   - `docker-compose.yml` + `docker-compose.override.yml.example`
   - `.env.example`
   - `images/attic-ai-images.tar.gz`
   - `models/ollama-models.tar.gz` (nomic-embed-text + default LLM)
3. Distribution: USB drive or secure file share

**v1.5 (polish):**

- Wrap in a signed + notarized `.dmg` with a background image and a `.command` file
- Add a `check-update.command` that fetches a version manifest from a local file server (if the use case allows occasional internet access)
- Reduce the AdonisJS Docker image from 2.45 GB to <500 MB via multi-stage build (this alone saves ~2 GB from the bundle)

**Critical size optimizations before shipping:**

- Optimize `the-attic-ai-admin` image with multi-stage build (target: <500 MB vs current 2.45 GB)
- Use `redis:7-alpine` (already 62 MB, good)
- Use `qdrant/qdrant:v1.16` (289 MB, good)
- The `ollama/ollama` image at 8.7 GB is unavoidable — it ships the inference runtime

**Approximate final bundle sizes:**

| Configuration | Uncompressed | Compressed |
|---|---|---|
| Default (no FalkorDB, no sidecar) | ~13 GB | ~10 GB |
| Full profile | ~15 GB | ~12 GB |
| + 7B LLM model (Q4_K_M) | +4.1 GB | already compressed |
| + nomic-embed-text:v1.5 | +274 MB | already compressed |

---

## Open Questions

1. **What Ollama models ship in the default bundle?** `nomic-embed-text:v1.5` is mandatory. The default generative model (mistral, llama3, qwen2.5?) determines whether the bundle fits on a 16 GB or 32 GB USB drive.
2. **Will updates be distributed air-gapped or can users have internet for updates?** This determines whether a `check-update.command` is worth building.
3. **Is codesigning a blocker for v1?** Unsigned `.command` files require a one-time right-click workaround. Acceptable for initial deployments to known users; not acceptable for wide distribution.
4. **Should the AdonisJS app image be rebuilt as part of the bundle script, or pre-built and pinned?** Pre-built + pinned is safer for reproducibility. Tagging as `the-attic-ai:v1.0.0` and using that in `docker save` is strongly preferred over `:latest`.

---

## Sources

- [Prepare Docker-Compose Stack as Tarball for Offline Installations (Shan's Corner)](https://shantanoo-desai.github.io/posts/technology/docker-compose-offline-stack/)
- [docker-compose-offline-install (GitHub)](https://github.com/DevinKott/docker-compose-offline-install)
- [Docker image save — official docs](https://docs.docker.com/reference/cli/docker/image/save/)
- [Air-gapped containers — Docker Docs](https://docs.docker.com/enterprise/security/hardened-desktop/air-gapped-containers/)
- [Ollama Offline Installation Guide (markaicode)](https://markaicode.com/ollama-offline-installation-guide/)
- [Ollama Docker volume discussion (open-webui)](https://github.com/open-webui/open-webui/discussions/836)
- [pkgbuild man page](https://keith.github.io/xcode-man-pages/pkgbuild.1.html)
- [2 ways to turn a script into a macOS install package (victoronsoftware)](https://victoronsoftware.com/posts/script-only-macos-install-package/)
- [Building Simple Component Packages (Scripting OS X)](https://scriptingosx.com/2025/08/building-simple-component-packages/)
- [Running Docker on Apple Silicon (oneuptime)](https://oneuptime.com/blog/post/2026-01-16-docker-mac-apple-silicon/view)
- [Docker Desktop PKG installer docs](https://docs.docker.com/enterprise/enterprise-deployment/pkg-install-and-configure/)
- [Deploying AI Models in Air-Gapped Environments (Medium)](https://medium.com/@sivakiran.nandipati/deploying-ai-models-in-air-gapped-environments-a-practical-guide-from-the-data-center-trenches-4c272788ccd5)
