# Data Detective implementation specification

## Product
A cozy detective game set in the Maplewick records agency. Upload CSV/XLSX or open a built-in case. Explore the desk, evidence board and archive through fixed camera hotspots and equivalent HTML buttons. Gameplay produces real confirmed repairs or saved evidence-backed findings. Story flavor is clearly separate from dataset facts.

## Workflow
Skippable eight-second intro -> desk/import -> select at most two tables -> select identity column and optional parent/child join columns -> briefing -> evidence board -> inspect clues -> preview -> confirm -> archive/latest undo/export. Guided, open and discovery modes can be switched without resetting the investigation.

Guided prioritizes generated cases. Open maps questions to profile, group_count, find_duplicates or trace_links. Discovery exposes those operations directly. All modes share the same engine and active records. Unsupported questions fail honestly; AI outages retain deterministic functionality.

## Cases and data
Three repair types: exclude duplicate rows, canonicalize user-confirmed aliases in a selected identity column, and repair broken child references to an existing unambiguous active parent key. Cases support keep or defer. Originals are immutable, IDs stable, previews read-only. Resolve binds to an expected revision and exact deterministic effect hash; an action ID retry has exactly one effect. Undo appends a compensating entry for the latest eligible action. Recompute cases after changes. Source/display names never replace stable IDs.

CSV/XLSX only; two files and two selected tables total (XLSX sheets count as tables). At most 500 data rows and 20 columns per selected table, 2 MB/file and an explicit parsed-data budget. Reject excess data rather than silently truncating. Formula cells are not executed; use cached literal results or an explicit unsupported-cell validation error. CSV exports escape formula-like strings. Export clean CSV per table, a new XLSX workbook including findings/history, and JSON report; no promise to preserve workbook styles/formulas.

## Architecture
React19/TypeScript/Vite with R3F9/Three.js and GSAP. HTML panels contain all evidence and controls. Backend Node24/Express/TypeScript, ExcelJS, csv-parse/stringify, Zod, Google GenAI. Firestore stores row documents and bounded history, with Firebase anonymous auth and resource ownership. Explicit file-backed local development mode uses isolated signed sessions and is never presented as Firebase. Production cloud mode validates Firebase tokens. One Cloud Run service serves frontend/API/static assets.

Gemini proposes validated references and bounded query plans, never executable code/SQL. Default model gemini-3.5-flash-lite configurable by environment. Request timeout ten seconds; deterministic fallback is labeled. API keys are server-only. Transactions contain no network calls, parsing or export work. Store immutable originals apart from working records; history patches stay under Firestore limits.

## Presentation
Follow DESIGN.md. Three station cameras with 800ms click transitions. Evidence cards and connecting thread interactions support pointer and keyboard. Server-confirmed actions drive progress and celebration. Intro end/skip/error enters the app once. Optional sound and reduced motion. WebGL unavailable -> usable illustrated office with identical controls. Demand rendering, DPR<=1.5, shared primitives/materials, no per-frame React state or postprocessing.

HyperFrames produces the opening as a static asset; normal builds do not render videos. GSAP handles live choreography. Remotion personalized recap is deferred from v1, with an extension note in documentation.

## Delivery
Root owns contracts/config/lockfiles, coordination/review/GitHub. Frontend owns client/public game and media/motion. Backend owns server. QA owns tests. Root initializes main then codex/data-detective, pushes reviewed milestones and maintains one draft PR. Preserve existing unrelated PDFs/notes.

Milestones: instructions/scaffold/CI; complete import-preview-resolve-undo-export; all modes/Gemini; game and motion; checks/deployment/docs. First make one real end-to-end flow work, then add visual depth. Four-hour timebox is aggressive: simplify ornamental detail before reducing data correctness or accessibility.

## Acceptance
CSV and XLSX linked-table import; selected identity/join columns; all three repairs; correct exported values; originals preserved; preview no writes; revision conflicts; action retries; undo; user isolation; malformed/failed Gemini; bounded questions; saved findings; keyboard/reduced-motion/no-WebGL flow; real 3D station movement; deployed URL smoke test. Ship two reusable demo datasets from different domains. CI runs lint, strict typechecking, unit/integration tests and production build; browser/a11y checks cover the integrated application.
