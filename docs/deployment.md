# Initial submission release

- Public frontend: https://data-detective-outliers.vercel.app
- Backend: https://data-detective-outliers-api-v1.onrender.com
- GitHub: https://github.com/lukan-lawslaf/OutLiers
- Application submission commit on main: 4b7c6b565266adebeea3b73a78228d9f482b0482.
- Vercel project: data-detective-outliers in nakulf2007-2371s-projects. Initial release is CLI/prebuilt, not an automatic Git release.
- Render workspace: Trip AI; free Singapore service srv-dbitduoae00c73ckta7g; deploy dep-dbitdvgae00c73cktbs0 reached live. Build: pnpm install --frozen-lockfile && pnpm build:server. Start: pnpm start. Node 24.18.
- Current submission uses secure anonymous sessions with temporary file storage. Render restarts clear investigations; users should export work. The created free Postgres instance dpg-dbit80ijnfac73bi6atg-a is not yet connected and expires November 30, 2026.
- Gemini and session secrets are backend environment variables, explicitly approved by the user, and are excluded from Git.
- Free Render service may sleep and take about a minute to wake. Vercel proxies /api to the Render service.
- Root and all 22 unit/API tests passed before the user requested testing to stop. Production browser verification and additional accessibility tests were deferred at that request. Captured screenshots show the actual local application with the same frontend build.
- HyperFrames video production and Remotion recap are deferred. The live game includes its accessible opening fallback, 3D room and GSAP motion.
- The original failed Render service srv-dbitbnss728c7388jdgg remains unused; it has the incorrect corepack-enable build command and can be removed later.
- Cloud Run remains an event eligibility requirement according to the supplied deck; this Vercel/Render release is the user's requested first-submission deployment.
