# Handoff: YourLocalJared — Onboarding + Chat UI

## Overview

**YourLocalJared** is a 100%-local RAG (Retrieval-Augmented Generation) tool. This handoff covers two surfaces:

1. **Onboarding wizard** (`onboarding.html`) — a 9-step setup flow that probes hardware, lets the user pick folders + file types + models, installs everything, ingests documents, validates with a test query, and hands off to Open WebUI.
2. **Chat UI** (`chat.html`) — a ChatGPT-style interface with conversation sidebar, streaming assistant responses, inline source citations, and a right-side sources panel showing retrieved chunks with similarity scores.

The product promise is **privacy + zero cloud dependencies**. Everything (LLM, embeddings, vector store) runs on-device. The visual language reinforces this: dense mono type, terminal/instrument aesthetic, amber accent.

## About the Design Files

The HTML files in this bundle are **design references** — React-in-Babel prototypes showing intended look, behavior, and state flow. They are **not** production code to ship directly.

Your job is to **recreate these designs inside the real YourLocalJared codebase** (Python FastAPI backend at `ylj/server.py` + a frontend framework of your choice — the existing `onboarding.html` in the repo is a single static file, so there is no current frontend framework commitment). Recommended stack for implementation:

- **Frontend:** React + Vite (or SvelteKit if you prefer), served by FastAPI as static assets
- **Backend:** extend `ylj/server.py` with the API endpoints listed below
- **Styling:** the current designs use plain inline styles + CSS variables; port to CSS Modules, Tailwind, or keep as-is

## Fidelity

**High-fidelity.** Exact colors, type sizes, spacing, and interactions are specified. Reproduce pixel-faithfully where reasonable. The designs have also been validated to be responsive (tested ≥1100px; sidebar collapses to icons at narrow widths in chat).

---

## Design Tokens

All tokens are defined as CSS variables in the `<style>` block of each HTML file.

### Colors (dark theme, default)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0a` | app background |
| `--panel` | `#141414` | cards, sidebars |
| `--panel-2` | `#1c1c1c` | nested panels, inputs |
| `--panel-3` | `#242424` | hovered items |
| `--border` | `#2a2a2a` | default borders |
| `--border-hi` | `#3a3a3a` | hovered/focused borders |
| `--text` | `#e8e8e8` | primary text |
| `--text-dim` | `#9a9a9a` | secondary text |
| `--text-faint` | `#5a5a5a` | tertiary text |
| `--accent` | `#f5b544` | amber — primary CTA, highlights |
| `--accent-hi` | `#ffc857` | amber hover |
| `--accent-dim` | `rgba(245,181,68,0.12)` | amber backgrounds |
| `--ok` | `#6ab04c` | success states |
| `--warn` | `#e88a3c` | warnings |
| `--err` | `#d64545` | errors |
| `--info` | `#4a9eff` | info, links |

The accent color is tweakable at runtime via the Tweaks panel (amber / green / cyan / violet / rose variants).

### Typography

```css
--mono: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
--sans: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
```

Headings + labels + numbers → `--mono`. Body copy + long prose → `--sans`. This split is load-bearing for the aesthetic — don't flatten it.

**Type scale used:**
- 9–10px: caps eyebrow labels (letter-spacing 0.1–0.15em)
- 11–12px: metadata, hints
- 13–14px: body, inputs
- 16–18px: emphasized body, composer input
- 22–26px: screen titles
- 32–36px: hero numbers

### Spacing / Radii

- Padding scale: 4, 8, 12, 16, 20, 24, 32, 40px
- Border radius: `4px` (pills, small buttons), `6px` (inputs, cards), `8–12px` (large cards)
- Hit targets: 36–44px minimum button height

### Shadows

Used sparingly — this is a flat design. When used:
- `0 1px 0 rgba(255,255,255,0.04) inset` for subtle top-edge highlights
- `0 8px 24px rgba(0,0,0,0.4)` for floating panels (Tweaks, modals)

---

## Onboarding — 9 Screens

Persisted step index in `localStorage['ylj.step']` so refresh doesn't lose progress.

### 1. Welcome
Privacy pitch. Three feature cards (Local, Fast, Private). Primary CTA: "Get started".

### 2. Hardware Probe
Animated terminal-style detection. Shows: OS, chip/CPU, RAM (total + free), GPU (+ VRAM), disk free.
- Animated typing effect on first run (can skip)
- "Re-probe" button to re-run
- Backend: `GET /api/setup/probe` → `{os, chip, ram_total, ram_free, gpu, vram, disk_free}`

### 3. Folders
Multi-folder tree picker. Shows file count + size per folder. Warnings on folders with >10k files.
Separate panel for ignore patterns (gitignore-style): defaults include `node_modules`, `.git`, `.venv`, `__pycache__`, `dist`, `build`, `.DS_Store`.
- Backend: `GET /api/setup/list-dir?path=` → `{entries: [{name, path, is_dir, file_count, size_bytes}]}`
- Backend: `POST /api/setup/scan` body `{folders: [], ignore: []}` → `{total_files, total_size}`
- **Currently mocked** — filesystem browsing requires a real backend endpoint.

### 4. File Types
Per-type checkboxes (Documents, Code, Data, Notes, etc.) with live per-folder file counts updating as toggles change. File type → extension mapping is in `src/data.jsx`.

### 5. Models
Tabbed LLM + embedding picker. Each model card shows: name, size, min RAM, license.
- Hardware-aware: models that exceed available RAM are locked with a "needs 32GB RAM" overlay
- Gated models (Mistral, Llama) show 🔒 — backend must detect missing HF auth and surface a login prompt
- Total download size computed live; checked against disk_free from step 2

### 6. Install
Per-model download progress with shimmer bars + live streaming log.
- Backend: `POST /api/setup/install` body `{llm_model, embedding_model}` → SSE stream of `{type: 'progress'|'log', model, pct, message}`
- On gated model without auth: stream emits `{type: 'auth_required', model, provider}` and UI opens token-paste modal

### 7. Ingest
Ring gauge showing overall progress. Phase indicator: parse → embed → store. Per-file log.
- Backend: `POST /api/ingest` body `{folders, ignore, extensions}` → SSE stream of `{phase, current_file, files_done, total_files, chunks_made}`

### 8. Test Query
Mini chat hitting the real chat endpoint so users validate the pipeline before handoff.
- Shows answer + cited sources with similarity scores
- "Re-run ingest" escape hatch if results look wrong

### 9. Handoff
Two service status cards (API server + Open WebUI). Each shows running/stopped, port, uptime.
- "Launch Open WebUI" button spawns OWUI subprocess
- Success state shows URL + next-steps checklist
- Backend: `GET /api/services/status`, `POST /api/services/start`, `POST /api/services/stop`

### Navigation & Shell
- Left rail: vertical step indicator (completed ✓, current dot, pending)
- Right rail: contextual help (tips, keyboard shortcuts)
- Footer bar: Back / Skip / Continue buttons
- Keyboard: ← → for prev/next when valid

---

## Chat UI

### Layout
Three-column fluid layout:

- **Left sidebar** (260px, collapsible to 56px icons below ~900px viewport)
  - Logo + wordmark top
  - "New chat" button (amber primary)
  - Search input
  - Conversation list grouped by time (Today, Yesterday, Previous 7 days, Older)
  - Bottom: settings + status indicator (green dot = API healthy)

- **Main chat column** (flexible, max-width 860px content)
  - Top bar: conversation title (editable inline) + model chip + actions (rename, export, delete)
  - Message thread: user messages right-aligned with subtle bg, assistant messages left-aligned with no bg
  - Assistant messages support streaming (character-by-character, with blinking cursor)
  - Inline citations rendered as `[1]`, `[2]` superscript chips — click to scroll the right panel to that source
  - Composer at bottom: auto-growing textarea (max 6 lines) + attach button + send button (disabled until text or on mid-stream)

- **Right sidebar — Sources panel** (320px, toggleable, hidden below ~1100px)
  - Per-retrieved-chunk card: filename, folder path, similarity score (0–1), chunk preview with match highlights
  - "Open source" action opens the file in the OS
  - Sticky header with "Sources for this answer (N)" count

### Interactions
- **Streaming:** assistant response appears token-by-token; blinking `▍` cursor while streaming; can Stop mid-stream
- **Regenerate:** on any assistant message, hover reveals regen + copy + thumbs up/down
- **Edit message:** user messages can be edited, which truncates the thread and re-runs from that point
- **Multiline composer:** Shift+Enter for newline, Enter to send
- **Source highlighting:** clicking `[2]` scrolls the right panel and flashes the card
- **Empty state:** no messages yet → shows suggested prompts + "What's indexed" summary

### Backend Contract
- `POST /v1/chat/completions` (OpenAI-compatible, with streaming): returns standard SSE deltas PLUS a custom `sources` field on the final message
- `GET /api/conversations` / `POST /api/conversations` / `DELETE /api/conversations/:id`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages` body `{role, content}` (stores messages)

### State model (React)
```
conversations: Conversation[]
currentConversationId: string | null
messages: Message[]       // for current conversation
streaming: boolean
streamingMessage: Partial<Message> | null
sources: RetrievedChunk[] // for latest assistant message
sourcesPanelOpen: boolean
sidebarCollapsed: boolean
```

---

## Interactions & Animation

- Button hover: 100ms background-color transition, slight brightness bump on accent buttons
- Card hover: 150ms border-color transition to `--border-hi`
- Step transitions (onboarding): 200ms fade + 8px translateY
- Terminal typing effect: ~30ms per char, cursor blinks at 1Hz
- Streaming chat: tokens appended as SSE arrives, no artificial delay
- Progress bars: smooth width transitions, 200ms ease-out
- Shimmer effect on in-progress download bars: 1.5s linear loop

No heavy motion libraries — all transitions are CSS. Framer Motion / Popmotion are optional nice-to-haves.

---

## Responsive Behavior

- **≥1200px:** full three-column chat, full onboarding with both side rails
- **900–1200px:** chat sources panel hides behind a toggle; onboarding right rail hides
- **700–900px:** chat sidebar collapses to icons; onboarding rails both hide
- **<700px:** the designs are desktop-first. If mobile matters, composer becomes a bottom sheet and sidebar becomes a drawer.

---

## Tweaks Panel

Both HTML files expose a bottom-right Tweaks panel (toggled by the host toolbar). Controls:
- Accent color (amber / green / cyan / violet / rose)
- Density (comfortable / compact)
- Probe animation on/off (onboarding only)
- Sidebar default state (chat only)

In production, fold these into a real Settings page — they're genuine user preferences.

---

## Assets

- No external images. Logo is an inline SVG (24 lines).
- Iconography: inline SVGs. No icon library dependency.
- Fonts: JetBrains Mono + Inter via Google Fonts. For offline guarantee, self-host them.

---

## Files in this bundle

- `onboarding.html` — entry point for the setup wizard
- `chat.html` — entry point for the chat UI
- `src/shell.jsx` — onboarding layout shell (top bar + rails + footer)
- `src/app.jsx` — onboarding router + state orchestrator
- `src/screens-*.jsx` — one file per wizard step
- `src/primitives.jsx` — shared UI primitives (Button, Card, Pill, etc.)
- `src/logo.jsx` — logo component (used in both surfaces)
- `src/data.jsx` — static catalogs: models, file types, default ignore patterns
- `src/tweaks.jsx` — runtime tweaks panel
- `src/chat-app.jsx` — chat root component + state
- `src/chat-sidebar.jsx` — conversation list
- `src/chat-messages.jsx` — message thread + streaming renderer
- `src/chat-composer.jsx` — input + send
- `src/chat-sources.jsx` — right-side sources panel
- `src/chat-data.jsx` — chat fixtures (conversations, messages, retrieved chunks)
- `src/chat-logo.jsx` — original logo variant (kept for reference)

---

## Suggested Implementation Order

1. **Probe** + **list-dir** endpoints (unblocks wizard steps 2–3)
2. **Model registry** (static catalog fine to start) + **install** SSE endpoint
3. **HF auth** flow for gated models
4. **Ingest** SSE endpoint (chunking strategy is the hard part — start with RecursiveCharacterTextSplitter, 512 tokens, 50 overlap)
5. **Chat completions** endpoint w/ RAG retrieval + source return
6. **Service manager** (subprocess spawn/kill for Open WebUI)
7. Frontend: port `onboarding.html` to React components, wire to endpoints
8. Frontend: port `chat.html` the same way
9. Persistence: `~/.ylj/config.json` for settings, `~/.ylj/chroma/` for vector DB
