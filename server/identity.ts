import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { AppError, insist } from './errors.js';

export type IdentityOverride = (request: Request) => string | Promise<string>;
interface IdentityOptions {
  override?: IdentityOverride;
  firebase: boolean;
  secure: boolean;
  secret: Buffer;
  allowedOrigins: string[];
}

export function identityMiddleware(options: IdentityOptions): RequestHandler {
  const sign = (value: string): string =>
    createHmac('sha256', options.secret).update(value).digest('hex');
  return async (request, response, next) => {
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.header('origin');
        if (origin) {
          let host = '';
          try {
            host = new URL(origin).host;
          } catch {
            /* Invalid origins fail the check below. */
          }
          insist(
            host === request.header('host') || options.allowedOrigins.includes(origin),
            403,
            'ORIGIN_REJECTED',
            'This request came from an untrusted origin.',
          );
        }
      }

      let uid: string;
      if (options.override) uid = await options.override(request);
      else if (options.firebase) {
        const token = request.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
        insist(token, 401, 'UNAUTHENTICATED', 'Sign in before opening an investigation.');
        try {
          const { getAuth } = await import('firebase-admin/auth');
          uid = (await getAuth().verifyIdToken(token)).uid;
        } catch {
          throw new AppError(
            401,
            'UNAUTHENTICATED',
            'Your sign-in has expired. Please sign in again.',
          );
        }
      } else {
        const cookie =
          typeof request.cookies['dd_session'] === 'string'
            ? (request.cookies['dd_session'] as string)
            : '';
        const pieces = cookie.split('.');
        const [candidate = '', signature = ''] = pieces;
        const valid =
          pieces.length === 2 &&
          /^[a-f0-9]{64}$/.test(candidate) &&
          /^[a-f0-9]{64}$/.test(signature) &&
          timingSafeEqual(Buffer.from(signature), Buffer.from(sign(candidate)));
        uid = valid ? candidate : randomBytes(32).toString('hex');
        if (!valid)
          response.cookie('dd_session', `${uid}.${sign(uid)}`, {
            httpOnly: true,
            sameSite: 'strict',
            secure: options.secure,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/',
          });
      }
      insist(uid && uid.length <= 256, 401, 'UNAUTHENTICATED', 'A valid identity is required.');
      response.locals['uid'] = uid;
      next();
    } catch (error) {
      next(error);
    }
  };
}
