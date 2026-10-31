# Storage Invaders - System Specification & Architecture (SPEC.md)

> **Challenge:** "We all procrastinate on painful digital chores - cleaning out 5,000 unread emails, sorting messy folders, reviewing expenses, or fixing lint errors. Build an experience where playing a fast-paced game or interactive story actually executes the real-world chore in the background."
>
> **Our Answer:** "Storage Invaders" - an arcade space shooter where obsolete, oversized Google Drive files become descending asteroids. Blasting an asteroid physically queues and moves that file to Google Drive trash in the background.

---

## 1. Problem Statement & Core Value Proposition

- **The Chore:** Digital hoarding in Google Drive. Users accumulate massive video files, outdated zip installers, duplicate downloads (`file (1).pdf`), old screen recordings, and multi-gigabyte temp files that consume cloud quotas and trigger upgrade warnings. Nobody wants to review dry spreadsheets of filenames.
- **The Game:** A fast-paced retro-arcade shooter inspired by classic space defense games. Asteroids descend with visual mass proportional to file size (logarithmic scale).
- **The Execution:** Real-world execution occurs asynchronously in a non-blocking queue. Shooting an asteroid queues the file for Google Drive trash. Players never wait for network calls or latency. If an asteroid passes unshot, the file remains completely untouched.
- **Unified Objective:** The game score is measured directly in **Megabytes / Gigabytes Freed**. Winning the game cleans the user's real storage drive.

---

## 2. System Architecture & Boundaries

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT (Browser)                                  |
|                                                                                   |
|  +-----------------------------+               +-------------------------------+  |
|  |     Pure Game Engine        |               |       Triage List Mode        |  |
|  | (Deterministic TS, 60fps,   |               |  (WCAG 2.2 AA Screen Reader & |  |
|  |  fixed timestep, seedable)  |               |   Accessible Table View)      |  |
|  +--------------+--------------+               +---------------+---------------+  |
|                 |                                              |                  |
|                 v                                              v                  |
|  +-----------------------------------------------------------------------------+  |
|  |                   Action Queue & Undo / Trash Bay                           |  |
|  |   - 5-second undo toast window                                              |  |
|  |   - Concurrency-limited batching (p-limit)                                  |  |
|  |   - Confirmed bytes-freed accumulator (no optimistic false reporting)       |  |
|  +--------------------------------------+--------------------------------------+  |
|                                         |                                         |
|                                         v                                         |
|                    +-----------------------------------------+                    |
|                    |          FileProvider Interface         |                    |
|                    +--------------------+--------------------+                    |
|                                         |                                         |
+-----------------------------------------+-----------------------------------------+
                                          |
                   +----------------------+----------------------+
                   |                                             |
                   v                                             v
+--------------------------------------+     +--------------------------------------+
|       DemoProvider (Client-side)     |     |     DriveProvider (HTTP to API)      |
|  - 60 seeded realistic fake files    |     |  - Authenticated Google Drive API    |
|  - Offline / Instant demo for judges |     |  - Real file metadata & trashing     |
+--------------------------------------+     +------------------+-------------------+
                                                                |
                                                                v
+-----------------------------------------------------------------------------------+
|                               SERVER (Node / Express)                             |
|                                                                                   |
|  - Helmet CSP, Rate Limiting, Request Size Caps, Structured JSON Logging         |
|  - Stateless Session: AES-256-GCM Encrypted httpOnly Cookie (Drive Access Token)  |
|  - Google OAuth 2.0 Auth Code Flow with cryptographic state check                 |
|  - Drive Service (@googleapis/drive): trash/restore via files.update               |
|  - Gemini Triage Service (@google/genai): batched structured JSON triage + cache  |
|  - HeuristicClassifier Fallback: graceful degradation when AI is unavailable      |
+-----------------------------------------------------------------------------------+
```

---

## 3. Game Design & Mechanics

### 3.1 Waves & Asteroid Dynamics

- **Wave Size:** ~15–25 files per wave, ordered from largest quota consumption and oldest access timestamp.
- **Logarithmic Mass Scaling:** Asteroid radius $R = R_{min} + k \cdot \ln(1 + \text{bytes} / 10^6)$. A 5 GB archive feels imposing and slow; a 50 MB zip is smaller and nimble.
- **Entity Pooling & Fixed Timestep:** Pre-allocated particle, bullet, and asteroid pools to avoid garbage collection spikes in 60 FPS animation loops.

### 3.2 Visual & Semantic Coding (WCAG Non-Color Dependent)

Asteroids and list items represent Gemini triage categories using redundant multi-modal cues:

1. **Junk:** Red outline/fill + prominent embossed **"X"** pattern + jagged rocky silhouette.
2. **Maybe:** Amber outline/fill + prominent **"?"** pattern + faceted hexagonal silhouette.
3. **Keep:** Gold outline/fill + prominent **Shield** icon + smooth circular crystal silhouette.

### 3.3 The "Keep" Confirmation Shield

- Blasting a **Keep** asteroid immediately pauses game simulation and opens a focused modal:
  > _"Caution: This file looks important! Gemini note: [reason]. Are you sure you want to trash it?"_
- Players can confirm or release the asteroid safely back into space.

### 3.4 Procedural Visuals & Synthesized Audio

- 100% procedural vector graphics rendered on HTML5 2D Canvas (no copyrighted or external bitmap sprites).
- 100% synthesized procedural sound effects generated via native WebAudio API oscillators and gain envelopes:
  - Laser zap (frequency sweep down)
  - Explosion (filtered white noise + decay)
  - Shield ping (harmonic sine chime)
  - Undo / restore chime (arpeggiated major chord)
- Master mute toggle, persistent user volume preference, zero autoplay audio.

---

## 4. Two Operating Modes (Zero-Login Demo vs Real Drive)

| Feature               | Demo Mode (Default)                                                             | Google Drive Mode                                             |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Authentication**    | None required (instant play for judges/evaluators)                              | Google OAuth 2.0 (Testing mode)                               |
| **Data Source**       | 60 realistic seeded files (`archive_2021.zip`, `raw_footage.mov`, `resume.pdf`) | Live Google Drive API (`q: 'me' in owners and trashed=false`) |
| **Gemini Triage**     | Real Gemini API call (with heuristic fallback)                                  | Real Gemini API call (with heuristic fallback)                |
| **Real Trash Effect** | Simulated in memory (safe sandbox)                                              | Live Drive API `files.update(trashed=true)`                   |
| **Scorer Experience** | Public Cloud Run URL works out-of-the-box                                       | Connect button with transparent permissions modal             |

Both modes implement the exact same `FileProvider` contract:

```typescript
export interface FileProvider {
  readonly mode: 'demo' | 'drive';
  listCandidates(): Promise<FileMeta[]>;
  trash(ids: string[]): Promise<TrashResult[]>;
  restore(ids: string[]): Promise<RestoreResult[]>;
}
```

---

## 5. Security & Privacy Model

1. **AI Advises, Human Decides:** Gemini classifications are purely advisory visual tags and reasons. Gemini never triggers a file mutation or trash action.
2. **Trash Only, Never Permanent Delete:** The server and client code strictly call `files.update` with `{ trashed: true }` or `{ trashed: false }`. Calls to `files.delete` or `emptyTrash` are strictly prohibited.
3. **Metadata Only to LLM:** Only `{ name, mimeType, size, modifiedTime, viewedByMeTime }` are transmitted to Gemini. File contents, byte streams, and folder paths are never ingested or sent.
4. **Prompt-Injection Sanitization:** File names are strictly treated as untrusted user data. They are wrapped in delimited JSON containers with explicit system prompts directing the model to evaluate metadata strictly as data.
5. **Encrypted Stateless Tokens:** No persistent database or server-side session memory. Google Drive tokens are encrypted via AES-256-GCM and stored in httpOnly, SameSite=Lax, Secure cookies.
6. **Least-Privilege Scopes:** Documented rationale for `https://www.googleapis.com/auth/drive` (required by Google Drive API to move existing files to trash when created by other apps or synced desktop tools).

---

## 6. Monorepo Structure

```
storage-invaders/
├── .github/
│   └── workflows/
│       └── ci.yml               # Lint, typecheck, Vitest, build
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── api/                 # API client & Drive HTTP calls
│   │   ├── audio/               # WebAudio sound generator
│   │   ├── components/          # React UI, HUD, Modals, Trash Bay, Consent
│   │   ├── game/
│   │   │   ├── engine/          # Pure TypeScript game loop, physics, collisions
│   │   │   └── renderer/        # Procedural HTML5 2D Canvas renderer
│   │   ├── list/                # Full accessible Triage List Mode
│   │   ├── providers/           # DemoProvider, DriveProvider, HeuristicClassifier
│   │   ├── queue/               # ActionQueue with 5s undo window
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── auth/                # OAuth 2.0 flow & AES-256-GCM cookies
│   │   ├── drive/               # Drive API v3 candidate listing and trashing
│   │   ├── gemini/              # Gemini structured triage + LRU cache
│   │   ├── middleware/          # Helmet CSP, rate limits, error handler
│   │   └── index.ts             # Express server, graceful shutdown, /healthz
│   └── tsconfig.json
├── shared/
│   ├── schemas.ts               # Zod schemas (FileMeta, Analysis, Verdict, etc.)
│   └── types.ts                 # Inferred TypeScript interfaces
├── docs/
│   ├── SPEC.md                  # This architecture specification
│   ├── DECISIONS.md             # Architecture Decision Records (ADRs)
│   └── RUBRIC_AUDIT.md          # 7-signal assessment scorecard
├── Dockerfile                   # Multi-stage production container
├── package.json
└── README.md
```

---

## 7. Rubric Mapping & Quality Standards

- **Problem Statement Alignment:** Foreground arcade action directly maps to background Drive trashing. Score is confirmed bytes freed.
- **Google Services:** Google Drive API v3, Google GenAI SDK (`@google/genai`), Google OAuth 2.0, Cloud Run, Secret Manager.
- **Code Quality:** Pure TS engine, zero coupling between game logic and DOM, strict TypeScript, 100% typed contracts.
- **Security:** AES-256-GCM cookie tokens, prompt injection defenses, trash-only invariant, metadata-only policy.
- **Efficiency:** Batched triage calls, LRU hash cache, Drive field masks, request prefetching, canvas object pooling.
- **Testing:** Comprehensive Vitest unit tests for engine, action queue, providers, and API mocks, plus automated axe-core accessibility checks.
- **Accessibility:** Triage List Mode, full keyboard support (Arrows/Space/Esc), ARIA live updates, prefers-reduced-motion, game speed control.
