import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Códigos de error estables por estado HTTP (contrato de la propuesta, §9). */
const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'QUOTA_EXCEEDED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

interface ErrorBody {
  code?: string;
  message?: string | string[];
  fields?: Record<string, string[]>;
}

/**
 * Formato uniforme de errores:
 * `{ "error": { "code", "message", "fields?" }, "requestId" }`
 *
 * Los servicios pueden lanzar excepciones HTTP con cuerpo
 * `{ code, message, fields? }` para controlar el código estable.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = DEFAULT_CODE_BY_STATUS[500];
    let message = 'Error interno del servidor.';
    let fields: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = DEFAULT_CODE_BY_STATUS[status] ?? `HTTP_${status}`;
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as ErrorBody;
        if (typeof b.code === 'string' && b.code.length > 0) code = b.code;
        if (typeof b.message === 'string' && b.message.length > 0) {
          message = b.message;
        } else if (Array.isArray(b.message) && b.message.length > 0) {
          // Respuesta por defecto de class-validator sin exceptionFactory.
          message = b.message.join(' ');
        }
        if (b.fields && typeof b.fields === 'object') fields = b.fields;
      }
    } else {
      // Error inesperado: se registra con stack, pero nunca se filtra al cliente.
      this.logger.error(
        `Excepción no controlada: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
      },
      requestId: req.requestId ?? null,
    });
  }
}
