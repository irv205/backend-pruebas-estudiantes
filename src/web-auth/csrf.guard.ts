import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { parseCookies } from './cookies.util';

const MUTATIONS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const EXEMPT_SUFFIXES = ['/auth/web/login', '/auth/csrf'];

/**
 * Double-submit CSRF SOLO para sesiones con cookie. Las peticiones con
 * `Authorization: Bearer` (clientes móviles/API) no se ven afectadas.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATIONS.includes(req.method)) return true;
    // Bearer manda: las rutas actuales siguen igual aunque el navegador tenga
    // cookies de una sesión web anterior.
    const authorization = req.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) return true;

    const cookies = parseCookies(req.headers.cookie);
    // Sin cookie de sesión: no hay sesión web protegida por CSRF.
    if (!cookies.refresh_token) return true;
    if (EXEMPT_SUFFIXES.some((suffix) => req.path.endsWith(suffix))) return true;

    const header = req.headers['x-csrf-token'];
    if (typeof header !== 'string' || !header || header !== cookies.csrf_token) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_INVALID',
        message: 'Falta o no coincide la cabecera X-CSRF-Token de la sesión web.',
      });
    }
    return true;
  }
}
