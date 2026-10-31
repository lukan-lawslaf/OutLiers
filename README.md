# Storage Invaders & Data Detective — Outlier'2026

> **Challenge:** "We all procrastinate on painful digital chores - cleaning out 5,000 unread emails, sorting messy folders, reviewing expenses, or fixing lint errors. Build an experience where playing a fast-paced game or interactive story actually executes the real-world chore in the background."

## Live Deployment Links (Updated)

- **Primary Live Application:** [https://data-detective-v2-outliers.vercel.app](https://data-detective-v2-outliers.vercel.app)
- **Alternative / Mirror Deployment:** [https://storage-invaders-v2.vercel.app](https://storage-invaders-v2.vercel.app)
- **Target Cloud Run Service:** [https://storage-invaders-app-847291240192.asia-south1.run.app](https://storage-invaders-app-847291240192.asia-south1.run.app)
- **Backend API Service:** [https://data-detective-v2-api.onrender.com](https://data-detective-v2-api.onrender.com)
- **GitHub Repository:** [https://github.com/lukan-lawslaf/OutLiers](https://github.com/lukan-lawslaf/OutLiers)

> [!NOTE]
> **No login required:** Evaluators and judges can open the live link immediately to play the sandbox demo without configuring cloud credentials or authenticating.

---

## How This Solves the Challenge

| Challenge Clause | Implementation & Architectural Feature |
|---|---|
| **"Painful digital chore"** | Automated detection and triage of obsolete cloud files, bloated media, duplicate records, and orphaned references that clog storage and workflows. |
| **"Fast-paced game / interactive experience"** | Dynamic game loop where items descend or surface as interactive investigation targets with real-time feedback and non-color redundant cues (Junk = Red 'X', Maybe = Amber '?', Keep = Gold Shield). |
| **"Actually executes the real-world chore"** | Confirmed player decisions trigger real-world mutations: non-destructive trashing or canonical data repairs with strict validation. |
| **"In the background"** | Asynchronous non-blocking Action Queue with an optimistic 5-second undo toast window and batched provider execution. The player never waits on API latency. |

---

## Architecture & Security Model

- **AI Advises, Human Decides:** Gemini (or local deterministic heuristic fallback) flags candidates and reasons, but never executes a mutation autonomously.
- **Trash & Soft-Repair Only:** Permanent deletions are strictly barred. All actions are fully reversible via the Undo window or session Restore.
- **Privacy First:** Only file metadata (names, types, sizes, timestamps) is processed. File byte streams and personal contents are never read or transmitted to LLMs.
- **Security & Hardening:** Express with Helmet Content Security Policy, rate limiting on API endpoints, strict Zod schema validation on all inputs, and stateless secure cookies.

---

## Running Locally

Node 24 and pnpm 10.20+ are required.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Run test suite:
```sh
pnpm test:unit
pnpm test:integration
pnpm build
```

See [docs/SPEC.md](docs/SPEC.md) for full architecture and technical specification.
