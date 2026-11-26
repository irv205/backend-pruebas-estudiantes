import type { AuthUser } from './auth-user';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identificador de petición propagado por RequestIdMiddleware. */
      requestId?: string;
      /** Usuario autenticado, rellenado por JwtAuthGuard. */
      user?: AuthUser;
    }
  }
}

export {};
