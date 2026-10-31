# Data Detective

Data Detective turns a data-cleaning chore into an investigation at the Maplewick records agency. Import CSV or XLSX, examine evidence, preview proposed repairs, and confirm changes before exporting the result. The original records remain available; the archive records decisions and supports undo of the latest eligible action.

The game supports up to two selected tables, 500 data rows and 20 columns per table, and files up to 2 MB. Guided, open-question and discovery modes use the same investigation. Duplicate rows, aliases and broken links can be reviewed; AI suggestions are optional and deterministic investigations work without an AI key. Story text is distinct from evidence in the imported data.

## Run locally

Use Node 24 and pnpm 10.20.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173. Local development uses a signed anonymous session and file storage in `.data`. Copy `.env.example` to `.env` to configure optional Gemini or another supported persistence provider; never commit credentials.

Run `pnpm check` for formatting, lint, type checking, unit and integration tests, production builds and the initial JavaScript budget. Run `pnpm test:e2e` and `pnpm test:a11y` for browser coverage. `pnpm motion:check` validates the intro composition and `pnpm motion:render` produces its optional pre-rendered video; normal application builds do not render video.

## Deployment and data

The current public application is [data-detective-outliers.vercel.app](https://data-detective-outliers.vercel.app), with its API on Render. The free Render service may take a minute to wake from inactivity. The backend uses PostgreSQL so investigations persist across service restarts. The provisioned free database expires on November 30, 2026; migrate or upgrade it before then to retain its data. The original temporary file-backed data was discarded during the approved switch.

The server keeps Gemini credentials private. When AI is enabled, selected dataset context may be sent to Gemini to answer investigation questions; do not upload data you are not authorized to share. AI output is validated and does not apply repairs on its own.

The agreed scope and contracts are in [implementation-plan.md](implementation-plan.md); the visual direction is in [DESIGN.md](../DESIGN.md). Personalized Remotion debriefs are a future extension, outside the first build.
