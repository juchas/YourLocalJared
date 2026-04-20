# YourLocalJared — Implementation Roadmap

Staged plan to turn the React-in-Babel design prototypes in [ylj/static/](ylj/static/) into a working product backed by the FastAPI server in [ylj/server.py](ylj/server.py). See [DESIGN_HANDOFF.md](DESIGN_HANDOFF.md) for the visual + UX spec and [CLAUDE.md](CLAUDE.md) for project architecture.

## Status

- ✅ RAG backend core works end-to-end (embed → Qdrant → Mistral via Transformers)
- ✅ Design prototypes render correctly (served via `python -m http.server` from [ylj/static/](ylj/static/))
- 🔴 Frontend is 100% mocked fixtures — no `fetch()` calls anywhere
- 🔴 Only 2 of ~15 design-required endpoints exist today

## Guiding principles

- **One screen at a time, end-to-end.** Each stage lands a real endpoint + real UI wiring.
- **Follow the wizard order (steps 2 → 9).** Builds visible momentum.
- **Defer the hard/optional stuff** to last stages (conversation persistence, Vite migration, Windows subprocess robustness).
- **Keep Babel-in-browser for now.** Revisit tooling only when it becomes a pain.

## Cross-cutting decisions (answer once, up-front)

- [ ] **Config persistence location.** Handoff suggests `~/.ylj/config.json`. Decide before Stage 2.
- [ ] **Path-safety policy** for `GET /api/setup/list-dir` — limit to user home? Allow any path? Affects Stage 2.
- [ ] **Conversation storage** — SQLite (stdlib, recommended) vs JSON files. Affects Stage 9/10.
- [ ] **SSE vs WebSocket** — handoff says SSE; recommend keeping it (one-way, simpler, native FastAPI support).

---

## Stages

### Stage 0 — Serve from FastAPI (foundation)

- [x] Mount `StaticFiles` in [ylj/server.py](ylj/server.py) for `src/*.jsx` assets
- [x] Add `GET /chat` route returning `chat.html`
- [x] Drop the separate `python -m http.server` — everything on port 8000, same-origin (no CORS)
- [x] Add `.gitignore` entries for `__pycache__/`, `.venv/`, `qdrant_data/`, `.env` (already present)
- [x] Smoke test: both pages load at `:8000/setup` and `:8000/chat`

**Risk:** 🟢 low · **Est:** ~30 min

### Stage 1 — Hardware probe (Screen 2) ✅

- [x] `GET /api/setup/probe` returning `{os, chip, ram_total, ram_free, gpu, vram, disk_free}` (psutil + torch)
- [x] Wire [src/screens-hardware.jsx](ylj/static/src/screens-hardware.jsx) — replace mocked `logLines` with real data
- [x] Keep terminal-style typing animation, feed real values into it
- [x] "Re-probe" button calls the endpoint again
- [x] Tier recommendation reads VRAM (not just system RAM) so GPU boxes get accurate model-size chips

**Risk:** 🟢 low · **Est:** 1–2h

### Stage 2 — Folders browser (Screen 3) ✅

- [x] `GET /api/setup/folders` → suggested home-dir folders, scanned with file/size/extension counts
- [x] `POST /api/setup/scan-folder` body `{path}` → scan a user-provided path
- [x] Gitignore-style ignore patterns via `ylj.documents.SKIP_DIRS` (`node_modules`, `.git`, `.venv`, `__pycache__`, `dist`, `build`, `qdrant_data`, etc.)
- [x] Path-traversal safety: `safe_home_path()` confines enumeration under `$HOME`, rejects symlink escapes
- [x] Wire [src/screens-folders.jsx](ylj/static/src/screens-folders.jsx) — `app.jsx` fetches on mount, screen calls `/api/setup/scan-folder` to add folders
- [x] Per-folder caps to prevent UI stall: 50k files / depth 12 / 2s time budget; `warn` field carries the reason

**Risk:** 🟡 med · **Est:** 3–4h

### Stage 3 — File types (Screen 4)

- [ ] Extend `/api/setup/scan` (or add `/api/setup/scan-by-type`) to return per-extension counts
- [ ] Wire [src/screens-filetypes.jsx](ylj/static/src/screens-filetypes.jsx) — live counts update as toggles change

**Risk:** 🟢 low · **Est:** 1h

### Stage 4 — Models catalog (Screen 5)

- [ ] Keep static catalog in [src/data.jsx](ylj/static/src/data.jsx) as source of truth (or move to backend)
- [ ] `GET /api/setup/hf-auth-status` — detect HF token presence + validity
- [ ] Hardware-aware locks use probe data from Stage 1
- [ ] Total download size computed live; checked vs `disk_free`
- [ ] Wire [src/screens-models.jsx](ylj/static/src/screens-models.jsx)

**Risk:** 🟢 low · **Est:** 2–3h

### Stage 4.5 — Ollama precondition (gate before install)

Detect-and-prompt, don't auto-install. Triggering an MSI/pkg/sh installer programmatically requires UAC/sudo on every platform and adds messy failure modes for marginal UX gain — the user has to click an elevation prompt anyway, so we just hand them the official installer and poll for the daemon.

- [ ] `GET /api/setup/ollama-status` → `{installed, version, daemon_running, models}` (extends [ylj/llm.py:status()](ylj/llm.py#L99) with binary-on-PATH check)
- [ ] New screen between Stage 4 (models picked) and Stage 5 (install): if daemon down, show platform-aware instructions + "Download Ollama" button → opens [ollama.com/download](https://ollama.com/download)
- [ ] Poll `/api/setup/ollama-status` every 2s; auto-advance once `daemon_running: true`
- [ ] If already up, skip the screen silently
- [ ] Surface clear error if user picks a model in Stage 4 but Ollama is missing — no silent failure at Stage 5

**Risk:** 🟢 low · **Est:** 1–2h

### Stage 5 — Install with SSE (Screen 6) — establishes SSE pattern

- [ ] `POST /api/setup/install` body `{llm_model, embedding_model}` → SSE stream of `{type: 'progress'|'log', model, pct, message}`
- [ ] On gated model without auth: emit `{type: 'auth_required', model, provider}`
- [ ] HF token-paste modal → `POST /api/setup/hf-auth`
- [ ] Wire [src/screens-install.jsx](ylj/static/src/screens-install.jsx) — real shimmer bars + streaming log
- [ ] **Document the SSE pattern** in [CLAUDE.md](CLAUDE.md) so stages 6/7/9 can reuse it

**Risk:** 🔴 high · **Est:** 4–6h

### Stage 6 — Ingest with SSE (Screen 7)

- [ ] Refactor [ylj/ingest.py](ylj/ingest.py) to yield progress events (parse → embed → store phases)
- [ ] `POST /api/ingest` body `{folders, ignore, extensions}` → SSE stream of `{phase, current_file, files_done, total_files, chunks_made}`
- [ ] Wire [src/screens-ingest.jsx](ylj/static/src/screens-ingest.jsx) — real ring gauge + per-file log

**Risk:** 🟡 med · **Est:** 3–4h

### Stage 7 — Streaming chat completions (Screen 8 + chat UI foundation)

- [ ] Upgrade `POST /v1/chat/completions` to support `stream: true` with SSE deltas
- [ ] Add custom `sources` field on the final SSE chunk (per design handoff §"Backend Contract")
- [ ] Keep non-streaming path working (Open WebUI compatibility)
- [ ] Wire [src/screens-test.jsx](ylj/static/src/screens-test.jsx) — token-by-token streaming with cited sources

**Risk:** 🟡 med · **Est:** 2–3h

### Stage 8 — Services & handoff (Screen 9) — wizard complete

- [ ] `GET /api/services/status` — running/stopped, port, uptime for API + Open WebUI
- [ ] `POST /api/services/start` — spawn Open WebUI subprocess
- [ ] `POST /api/services/stop` — kill it cleanly (Windows vs POSIX handling)
- [ ] Wire [src/screens-handoff.jsx](ylj/static/src/screens-handoff.jsx)
- [ ] End-to-end test: fresh install → wizard → chat works

**Risk:** 🟡 med · **Est:** 2–3h

### Stage 9 — Chat UI core

- [ ] Wire [src/chat-app.jsx](ylj/static/src/chat-app.jsx) to the streaming endpoint from Stage 7
- [ ] Inline `[1]` / `[2]` citation chips → scroll + flash right-panel source card
- [ ] Sources panel from retrieved chunks (filename, folder, similarity, preview)
- [ ] Composer: auto-grow, Shift+Enter newline, Enter send, stop mid-stream, regenerate
- [ ] Conversations in-memory (localStorage) — persistence deferred to Stage 10

**Risk:** 🔴 high · **Est:** 4–6h

### Stage 10 — Chat persistence

- [ ] SQLite schema for conversations + messages (stdlib, one file, no deps)
- [ ] `GET /api/conversations`, `POST /api/conversations`, `DELETE /api/conversations/:id`
- [ ] `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages`
- [ ] Wire sidebar conversation list (grouped: Today, Yesterday, Previous 7 days, Older)
- [ ] Edit-message truncation + re-run from edit point

**Risk:** 🟡 med · **Est:** 3–4h

### Stage 11 — Polish (optional)

- [ ] Migrate React-in-Babel → Vite + real React build (kills first-load flash, better DX)
- [ ] Self-host JetBrains Mono + Inter for offline guarantee
- [ ] Tweaks panel → real Settings page
- [ ] Responsive audit at <900px and <700px breakpoints
- [ ] pytest coverage for API endpoints + RAG pipeline
- [ ] Accent color + density user prefs persisted to backend

**Risk:** 🟢 low · **Est:** open-ended

---

## Critical path

```
Stage 0 (foundation)
   ↓
Stage 1 → 2 → 3 → 4       (wizard setup screens)
                  ↓
                Stage 5 (SSE pattern established)
                  ↓
              ┌───┴───┐
          Stage 6   Stage 7 ──→ Stage 9 → Stage 10
              ↓        ↓
              └───→ Stage 8 (wizard complete)
                       ↓
                    Stage 11 (polish)
```

Stage 5 is the critical dependency — it establishes the SSE pattern reused by Stages 6, 7, and 9.

## Suggested cadence

- **Week 1:** Stages 0–4 — onboarding through models screen on real data
- **Week 2:** Stages 5–6 — install + ingest streaming
- **Week 3:** Stages 7–8 — streaming chat + services = full wizard live
- **Week 4:** Stages 9–10 — chat UI live + persistence
- Stage 11 when / if needed

## How to use this doc

1. Start the stage at the top of the uncompleted list
2. Tick boxes as each bullet lands
3. When every box in a stage is ticked, mark the stage header with ✅ (e.g. `### Stage 0 — ... ✅`)
4. Cross-cutting questions at the top should be answered before they're needed by a stage

---

## Stage ∞ — Ship as an Electron desktop app (optional)

Once the web product is feature-complete, wrap it as a native desktop app so
users get an icon in their dock and don't have to remember `python start.py`.

**Why Electron over Tauri (for this project):**

- The frontend is already React + plain HTML/CSS — no Rust required; Node is enough.
- Electron bundles its own Chromium, so the UI renders identically on macOS,
  Windows, and Linux. Tauri uses the OS webview and Linux's `webkit2gtk` lags
  Chromium by years.
- Electron's ecosystem for desktop concerns (auto-updaters, crash reporters,
  code signing, Mac App Store distribution) is mature; Tauri 2.0 is closing
  the gap but still has more edge cases.
- Bundle size isn't a blocker — we're already shipping ~2 GB of model weights.

**Scope sketch:**

- [ ] Add an `electron/` directory with `main.js` that launches the bundled
      FastAPI server as a child process and loads `http://localhost:8000/setup`
      (or `/chat` after onboarding) into a `BrowserWindow`.
- [ ] Package Python + deps via `pyinstaller` or ship a portable venv; spawn
      it from Electron on app start.
- [ ] Ollama stays a user-installed system daemon (don't bundle — licensing
      + size). The existing `/api/setup/ollama-status` check already handles
      "not installed / not running" cleanly.
- [ ] Use `electron-builder` to produce `.dmg` (macOS), `.exe` (Windows),
      and `.AppImage`/`.deb` (Linux). Sign for macOS notarization + Windows
      Authenticode.
- [ ] Mac App Store target via `electron-builder --mac mas` if we want
      first-party distribution (requires sandboxing review; the Ollama
      daemon requirement may conflict with sandbox expectations — evaluate
      before committing).
- [ ] System tray + quit handler; auto-start option.
- [ ] Auto-updater wired to GitHub Releases (`electron-updater`).

**Deferred — pick up only after web product is stable.** The web UI is the
source of truth; Electron is a packaging concern, not a rewrite.
