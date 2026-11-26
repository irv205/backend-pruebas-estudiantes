import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';

/**
 * Log JSON por petición a stdout. NUNCA registra cuerpos, contraseñas ni tokens;
 * solo metadatos de la petición. Una línea por petición, al finalizar.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const line = {
          level: res.statusCode >= 500 ? 'error' : 'info',
          msg: 'http_request',
          requestId: req.requestId ?? null,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          userId: req.user?.id ?? null,
        };
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(line));
      }),
    );
  }
}
