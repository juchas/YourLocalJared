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
- [ ] Smoke test: both pages load at `:8000/setup` and `:8000/chat` *(manual verification pending — requires FastAPI deps installed)*

**Risk:** 🟢 low · **Est:** ~30 min

### Stage 1 — Hardware probe (Screen 2)

- [ ] `GET /api/setup/probe` returning `{os, chip, ram_total, ram_free, gpu, vram, disk_free}` (psutil + torch)
- [ ] Wire [src/screens-hardware.jsx](ylj/static/src/screens-hardware.jsx) — replace mocked `logLines` with real data
- [ ] Keep terminal-style typing animation, feed real values into it
- [ ] "Re-probe" button calls the endpoint again

**Risk:** 🟢 low · **Est:** 1–2h

### Stage 2 — Folders browser (Screen 3)

- [ ] `GET /api/setup/list-dir?path=` → `{entries: [{name, path, is_dir, file_count, size_bytes}]}`
- [ ] `POST /api/setup/scan` body `{folders, ignore}` → `{total_files, total_size}`
- [ ] Gitignore-style ignore patterns (defaults: `node_modules`, `.git`, `.venv`, `__pycache__`, `dist`, `build`, `.DS_Store`)
- [ ] Path-traversal safety (decide scope per cross-cutting question above)
- [ ] Wire [src/screens-folders.jsx](ylj/static/src/screens-folders.jsx) — replace mocked `FOLDERS` fixture
- [ ] Warning banner on folders >10k files

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
