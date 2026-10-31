# Data Detective — The Maplewick Casefiles

A cozy 3D detective game that improves real CSV and Excel data. Explore the desk, evidence board and archive; investigate duplicates, aliases and broken relationships; preview confirmed repairs and export the corrected data with a change history.

## Run locally

Node 24 and pnpm 10.20+ are required.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173. The API runs on port 3001. Start with the market or club practice case, select tables and identity/join columns, then investigate at the board. Local mode uses an isolated HTTPOnly session and a durable ignored `.data` directory. Set `GEMINI_API_KEY` on the server to enable AI query planning; deterministic investigations work without it.

## Verify

```sh
pnpm check
pnpm test:e2e
pnpm test:a11y
```

Meaningful automated unit/API checks cover CSV/XLSX imports, previews, idempotent actions, stale revisions, undo, ownership isolation, query evidence, export safety, failed commits and AI timeout/failure. Browser and accessibility checks are a follow-up milestone for the initial deadline release.

## Hosting

The requested release uses Vercel for the frontend and Render for the API with Postgres. All browser API calls remain relative to `/api` and are proxied through the frontend domain. Render's free service can take about a minute to wake after inactivity. Its free Postgres database expires on November 30, 2026; export important investigations before then.

Hosted configuration: `AUTH_MODE=session`, `PERSISTENCE_MODE=postgres`, `DATABASE_URL`, a persistent random `SESSION_SECRET` of at least 32 characters, `CLIENT_ORIGIN` matching the frontend origin, and optional `GEMINI_API_KEY`. Secrets stay on the backend. Firebase/Firestore and Cloud Run support are retained as alternative deployment options. Cloud Run is required by the event deck for judging; the Vercel/Render release does not itself meet that hosting requirement.

## Design and architecture

React19/TypeScript/Vite, Three.js/R3F9, GSAP, Node24/Express, Postgres/Firestore/file adapters and Gemini. Immutable originals, preview hashes, atomic action history and server-side ownership keep game progress tied to actual committed results. CSV/XLSX inputs support two tables, 500 rows and 20 columns each, with 2MB per-file limits.

See [AGENTS.md](AGENTS.md), [DESIGN.md](DESIGN.md), and [the implementation specification](docs/implementation-plan.md). HyperFrames opening and Remotion personalized debrief are follow-up motion-production work; the game currently uses its functional opening fallback and live GSAP motion.
