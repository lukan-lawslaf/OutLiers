import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from './errors.js';
import { initializeRuntime, type AppOptions } from './runtime.js';
import { intakeRoutes } from './routes/intake.js';
import { repairsRoutes } from './routes/repairs.js';
import { inquiriesRoutes } from './routes/inquiries.js';
import { exportsRoutes } from './routes/exports.js';

export type { AppOptions } from './runtime.js';

export async function createApp(options: AppOptions = {}): Promise<Express> {
  const runtime = await initializeRuntime(options);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.locals['close'] = async () => {
    await runtime.store.close?.();
  };
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.get(['/api/health', '/healthz'], (_request, response) => response.json({ ok: true }));
  app.get('/api/config', (_request, response) => response.json(runtime.config));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMIT', message: 'Please wait a moment before continuing.' },
      },
    }),
  );
  app.use('/api', runtime.identity);
  app.use(intakeRoutes(runtime.store, Boolean(runtime.planner)));
  app.use(repairsRoutes(runtime.store));
  app.use(inquiriesRoutes(runtime.store, runtime.planner));
  app.use(exportsRoutes(runtime.store));
  app.use('/api', (_request, _response, next) =>
    next(new AppError(404, 'NOT_FOUND', 'API route not found.')),
  );

  if (options.serveClient ?? process.env['NODE_ENV'] === 'production') {
    const client = path.resolve('dist/client');
    app.use(express.static(client));
    app.get('/{*path}', (_request, response) => response.sendFile(path.join(client, 'index.html')));
  }
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof AppError)
      response.status(error.status).json({ error: { code: error.code, message: error.message } });
    else if (error instanceof z.ZodError)
      response.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The request has invalid or unsupported fields.',
        },
      });
    else if (error instanceof multer.MulterError)
      response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: {
          code: error.code,
          message: 'Upload one or two CSV/XLSX files, each at most 2 MB.',
        },
      });
    else if ((error as { type?: string })?.type === 'entity.too.large')
      response
        .status(413)
        .json({ error: { code: 'REQUEST_LIMIT', message: 'This request is too large.' } });
    else if (
      error instanceof SyntaxError &&
      (error as { type?: string }).type === 'entity.parse.failed'
    )
      response.status(400).json({
        error: { code: 'INVALID_JSON', message: 'The request body must contain valid JSON.' },
      });
    else
      response.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The operation could not be saved. Your previous records remain unchanged.',
        },
      });
  });
  return app;
}
