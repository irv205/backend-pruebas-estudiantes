import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { isUuid } from '../common/utils/uuid.util';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { duplicateOrderKey } from './scenarios';
import { SimulatorService } from './simulator.service';

type SimRequest = Request & { user?: AuthUser };
type ListBody = { data?: unknown[]; meta?: Record<string, unknown> };

/**
 * Aplica los escenarios activados SOLO al espacio resuelto de la petición.
 * Topes duros: retardo máximo, concurrencia máxima y tamaño máximo de lista.
 * Sin configuración persistida no hace nada (API estable por defecto).
 */
@Injectable()
export class ScenarioInterceptor implements NestInterceptor {
  private activeDelays = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly simulator: SimulatorService,
    private readonly config: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<SimRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    if (!req.path.startsWith('/api/v1')) return next.handle();
    // Los endpoints de gestión del simulador y el reset deben poder desactivar
    // escenarios aunque haya uno activo (si no, el espacio quedaría atrapado).
    if (req.path.includes('/scenarios') || req.path.endsWith('/reset')) return next.handle();

    const spaceId = await this.resolveSpaceId(req);
    if (!spaceId) return next.handle();
    const cfg = await this.simulator.activeFor(spaceId);
    if (!cfg) return next.handle();

    // Errores primero: no se combinan escenarios para mantener resultados claros.
    if (cfg.temporary503) {
      throw new ServiceUnavailableException({
        code: 'SIMULATED_503',
        message: 'Error temporal simulado. Reintenta con backoff exponencial.',
      });
    }
    if (cfg.sessionExpired) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Sesión vencida simulada. Renueva con /api/v1/auth/refresh.',
      });
    }
    if (cfg.insufficientPermission) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Permiso insuficiente simulado.',
      });
    }
    if (cfg.rateLimit) {
      res.setHeader('Retry-After', '5');
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Límite de peticiones alcanzado simulado. Respeta Retry-After.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (cfg.invalidFile && (req.headers['content-type'] ?? '').startsWith('multipart/form-data')) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Archivo inválido simulado (tipo o tamaño).',
        fields: { file: ['Formato no aceptado.'] },
      });
    }
    // Pedido repetido: se sustituye la clave por una fija del espacio. La
    // idempotencia persistida devuelve el primer pedido en los reintentos.
    if (cfg.duplicateOrder && req.method === 'POST' && req.path === '/api/v1/orders') {
      req.headers['idempotency-key'] = duplicateOrderKey(spaceId);
    }
    if (cfg.concurrentEdit && ['PATCH', 'PUT'].includes(req.method)) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Edición simultánea simulada. Recarga y vuelve a enviar la versión actual.',
        fields: { version: ['La versión enviada no coincide con la actual.'] },
      });
    }

    const maxDelay = this.config.getOrThrow<number>('SCENARIO_MAX_DELAY_MS');
    const maxConcurrency = this.config.getOrThrow<number>('SCENARIO_MAX_CONCURRENCY');
    if (cfg.timeout || cfg.slowResponse) {
      if (this.activeDelays >= maxConcurrency) {
        res.setHeader('Retry-After', '1');
        throw new HttpException(
          { code: 'SIMULATOR_BUSY', message: 'Demasiadas respuestas simuladas en curso.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const delay = cfg.timeout ? maxDelay : Math.min(1000, maxDelay);
      this.activeDelays += 1;
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } finally {
        this.activeDelays -= 1;
      }
    }

    const result = next.handle();
    if (cfg.emptyList || cfg.largeVolume) {
      const maxItems = this.config.getOrThrow<number>('SCENARIO_LARGE_VOLUME_COUNT');
      return result.pipe(
        map((body: unknown) => this.transformList(body, cfg.emptyList, cfg.largeVolume, maxItems)),
      );
    }
    return result;
  }

  private transformList(
    body: unknown,
    empty: boolean,
    large: boolean,
    maxItems: number,
  ): unknown {
    if (!body || typeof body !== 'object' || !Array.isArray((body as ListBody).data)) return body;
    const list = body as ListBody;
    if (empty) {
      return {
        ...list,
        data: [],
        meta: { ...(list.meta ?? {}), total: 0, totalPages: 0 },
      };
    }
    if (large) {
      const count = Math.max(10, Math.min(maxItems, 500));
      const data = Array.from({ length: count }, (_, index) => ({
        id: `simulado-${index + 1}`,
        name: `Registro simulado ${index + 1}`,
        createdAt: new Date().toISOString(),
      }));
      return {
        ...list,
        data,
        meta: { page: 1, limit: count, total: count, totalPages: 1 },
      };
    }
    return body;
  }

  /** Bearer: espacio del token o `x-space-id` autorizado; público: cabecera. */
  private async resolveSpaceId(req: SimRequest): Promise<string | null> {
    const header = req.headers['x-space-id'];
    const candidate = typeof header === 'string' ? header : undefined;
    if (!candidate) return req.user?.spaceId ?? null;
    const space = isUuid(candidate)
      ? await this.prisma.space.findUnique({ where: { id: candidate }, select: { id: true } })
      : await this.prisma.space.findUnique({ where: { slug: candidate }, select: { id: true } });
    return space?.id ?? null;
  }
}
