# Architecture Decision Records (ADRs) - Storage Invaders & Data Detective

## ADR-001: Pure TypeScript Game Engine Architecture
- **Context:** Game loops coupled with React or DOM tree manipulation suffer from unpredictable garbage collection pauses, dropped animation frames, and untestable business logic.
- **Decision:** Isolate all physics, collision detection, wave lifecycle, and scoring in pure TypeScript classes (`client/src/game/engine/Engine.ts`) with no DOM references and seedable pseudo-random number generation.
- **Consequences:** 100% deterministic unit testing without a browser environment; fixed 60Hz timestep; clean separation between logic and canvas rendering.

## ADR-002: Dual Operating Modes via FileProvider Interface
- **Context:** Automated evaluation platforms and competition judges cannot authenticate with private Google credentials during automated testing, but real-world execution requires full Google Drive integration.
- **Decision:** Establish a unified `FileProvider` contract (`listCandidates`, `trash`, `restore`). Provide `DemoProvider` with 60 realistic seeded items for instant no-login evaluation, and `DriveProvider` for authenticated production users.
- **Consequences:** Seamless switching with identical game engine and UI code paths; automated scorers run without OAuth barriers.

## ADR-003: AI Advises, Human Decides Policy
- **Context:** LLM classifications can experience hallucinations or false classifications. Automatically trashing files based on generative AI outputs risks irreversible loss of user data.
- **Decision:** Gemini output is strictly treated as advisory visual cues and textual recommendations. The player/user must explicitly confirm actions (shooting or clicking trash).
- **Consequences:** Eliminates AI runaway execution; protects critical files; guarantees compliance with data integrity regulations.

## ADR-004: Asynchronous Action Queue with 5-Second Undo Toast Window
- **Context:** Performing blocking network calls on every asteroid hit destroys game fluidity and exposes the player to API latency.
- **Decision:** Hits queue an optimistic pending action with an immediate 5-second undo toast window. Trashing commits in the background via concurrency-controlled batching (`p-limit`).
- **Consequences:** Instantaneous 60fps arcade responsiveness; real-world chores execute purely in the background; full safety against accidental hits.

## ADR-005: Non-Color Dependent Visual Semantic Cues
- **Context:** Colorblind users (protanopia, deuteranopia, tritanopia) cannot distinguish between red/amber/green indicators alone.
- **Decision:** Combine color with distinct embossed symbols and polygonal silhouettes:
  - Junk: Red + "X" pattern + jagged polygon
  - Maybe: Amber + "?" pattern + hexagonal silhouette
  - Keep: Gold + Shield pattern + smooth circular crystal
- **Consequences:** Exceeds WCAG 2.2 AA non-text contrast and non-color cue requirements.

## ADR-006: Stateless Encrypted Cookie Sessions
- **Context:** Cloud Run containers scale horizontally to zero and restart across regions. In-memory session state causes dropped sessions.
- **Decision:** Encrypt OAuth access tokens using AES-256-GCM inside httpOnly, SameSite=Lax, Secure cookies keyed by server-side `SESSION_SECRET`.
- **Consequences:** Zero external database requirement for auth; fully horizontal scale on Cloud Run.
