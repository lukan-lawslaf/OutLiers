# Storage Invaders / Data Detective - Updated Submission Release

> Historical submission notes: these v2 endpoints returned 404 when checked on October 31, 2026. The active Data Detective deployment and its current limitations are documented in [data-detective.md](data-detective.md).

- Public Live Deployment: https://data-detective-v2-outliers.vercel.app
- Alternative / Mirror Deployment: https://storage-invaders-v2.vercel.app
- Cloud Run Target Service: https://storage-invaders-app-847291240192.asia-south1.run.app
- Backend API Service: https://data-detective-v2-api.onrender.com
- GitHub Repository: https://github.com/lukan-lawslaf/OutLiers

## Deployment Notes

- Updated deployment endpoint configured for second submission slot to ensure distinct submission URL compliance.
- No-login demo mode active by default for instant evaluator accessibility without requiring external credentials.
- Backend services configured with health check `/healthz` and rate-limited API routes.
