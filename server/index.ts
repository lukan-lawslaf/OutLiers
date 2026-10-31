import { createApp } from './app.js';
const port = Number(process.env['PORT'] ?? 3001);
const app = await createApp();
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Data Detective server listening on port ${port}`);
});
let stopping = false;
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  server.close(() => {
    Promise.resolve(app.locals['close']?.())
      .then(() => {
        clearTimeout(deadline);
        process.exit(0);
      })
      .catch(() => process.exit(1));
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
