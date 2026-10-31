# Data Detective agent instructions

## Mission and source of truth

Build a cozy detective game that turns user-confirmed investigations into real data repairs or evidence-backed findings. Read `docs/implementation-plan.md` before implementing features and `DESIGN.md` before changing visuals or motion. The root `package.json` is the command source of truth; keep this document synchronized when scripts change.

## Stack and boundaries

- React 19, TypeScript, Vite, Three.js through React Three Fiber 9, GSAP and @gsap/react.
- Node 24, Express, Firestore, Firebase anonymous authentication, Google GenAI with Zod validation, ExcelJS and csv-parse/stringify.
- HyperFrames authors the skippable opening. Video rendering is separate from normal app builds. Remotion personalized debriefs are deferred.
- CSV/XLSX only; two selected tables total, at most 500 data rows and 20 columns each, 2 MB per uploaded file. Reject over-limit input explicitly; preserve source values.
- Client presentation is separate from the server's authoritative investigation state. Shared API types live in `shared/`.

## Agent ownership

| Role | Configuration | Owned paths |
| --- | --- | --- |
| Frontend | gpt-6.1-sol, xhigh | `client/`, `public/game/`, `public/media/`, `motion/` |
| Backend | gpt-6.1-sol, high | `server/` |
| Testing | gpt-6-luna, max | `tests/` |
| Main reviewer | current parent chat; requested gpt-6.1-sol, high | shared contracts, root configuration, dependencies/lockfile, docs, integration, GitHub |

Only the main reviewer edits root configs, package manifests, lockfiles or shared contracts and creates commits, branches or pushes. Ask the parent for a contract/dependency change; do not independently change another agent's files. Agents share a checkout. Preserve other agents' edits and existing user PDFs and notes.

## Commands

Run from repository root using pnpm. After bootstrapping, the following scripts must exist and remain accurate:

```text
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:a11y
pnpm build
pnpm check
pnpm motion:check
pnpm motion:render
pnpm deploy:cloudrun
```

`check` runs lint, typecheck, unit tests, integration tests and production build. Browser checks cover the integrated app. Follow README setup for Firebase emulators or Google credentials. Use the bundled runtime executable if a system command is unavailable; do not overwrite global user settings.

## Data integrity and security

- Original records are immutable. Store working rows separately and keep bounded reversible patches with stable table/column/row IDs.
- Preview an edit before applying it. Resolve binds to the exact revision and preview effect hash. Mutations have unique action IDs and idempotent retries.
- Atomically commit rows, history, case updates and revision. Keep network calls, Gemini, parsing and exports outside transaction callbacks.
- Undo only the latest action, appending a compensating history entry. Recompute affected cases and progress from saved state.
- All detectors, queries and exports share the active-row exclusion policy. Link targets must be active, existing and unambiguous.
- Verify ownership on every resource operation. Production Firebase identity is verified server-side. Local/demo fallback must be explicitly labeled and disabled when cloud authentication is configured.
- Gemini only proposes validated query plans and suggestions referencing existing data. Execute allowlisted operations in code. Treat uploaded cells as untrusted input, never executable instructions, SQL, HTML or formulas.
- Keep credentials server-side, suppress uploaded cell contents in logs, enforce upload/parsed-data limits, and neutralize spreadsheet formula injection on export.
- Respect Firestore document/transaction limits: use row documents and bounded patches rather than full-table payloads in a single document.

## Game, accessibility and performance

- Three stations: desk, board and archive. Hotspots and visible HTML buttons dispatch the same navigation action.
- Evidence and all data controls are accessible HTML; canvas-only controls cannot be required to finish a workflow. Provide keyboard connection selection, visible focus, labels and live result announcements.
- Use demand rendering, DPR capped at 1.5, shared geometry/materials and simple lighting. Invalidate frames during imperative camera tweens; stop when complete. Avoid React state updates per frame.
- One camera controller owns transitions. Scope and clean up GSAP timelines. Reduced motion skips decorative movement and intro; WebGL failure uses the functional 2D office.
- Success animation, progression and counts follow confirmed server persistence. Failed requests retain the preview and allow safe retry. Export includes committed data only.
- Intro end, skip and failure enter the game once. Sound is opt-in and independently mutable.

## GitHub and delivery

- Remote: `https://github.com/lukan-lawslaf/OutLiers.git`. Initialize `main` with instructions/scaffold; implement on `codex/data-detective` and maintain one draft PR.
- Main reviewer stages explicit project paths, reviews changes and pushes tested milestones. Never force-push, overwrite unrelated changes, or commit credentials, local input PDFs/notes, node_modules, build caches or runtime data.
- Each milestone reports concrete behavior, validation and remaining limitations. Attach any created PR to this chat.
- Completion requires the import-to-export flow, meaningful data/security tests, browser/accessibility checks, reviewed deployment setup and an accurate README. A generated build alone does not prove end-to-end functionality.

