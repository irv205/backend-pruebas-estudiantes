import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { validationExceptionFactory } from './common/validation/validation-exception';

/**
 * Configuración compartida con las pruebas e2e: así los tests ejercitan el
 * mismo prefijo, validación y CORS que la aplicación real.
 * Se mantiene fuera de main.ts para que importarlo no arranque un servidor.
 */
export function configureApp(app: INestApplication): void {
  // Contrato §9: /api/v1 para la API; /health y la página /portal quedan fuera.
  // La exclusión de 'portal' es exacta: /api/v1/portal/* conserva el prefijo.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)', 'portal'] });

  // Portal del estudiante: HTML/CSS/JS vanilla servidos por la propia app.
  // `index: false` deja que el controlador responda GET /portal con el index.
  (app as NestExpressApplication).useStaticAssets(join(__dirname, '..', 'public', 'portal'), {
    prefix: '/portal',
    index: false,
    redirect: false,
    fallthrough: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const origins = (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({
    // `credentials: true` es obligatorio para el flujo web con cookies.
    // Con CORS_ORIGIN=* se refleja el origen de la petición (no se envía '*').
    origin: origins.includes('*') ? true : origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-space-id',
      'x-request-id',
      'Idempotency-Key',
      'X-CSRF-Token',
    ],
  });

  const swagger = new DocumentBuilder()
    .setTitle('Backend de práctica para estudiantes')
    .setDescription(
      'API REST de práctica (Etapas 1-4). Prefijo `/api/v1`. Usa `x-space-id` para el sandbox ' +
        'anónimo en `/public/*` o para seleccionar un espacio de equipo; usa ' +
        '`Authorization: Bearer <accessToken>` para el espacio personal. Incluye categorías, ' +
        'tareas, roles, archivos (S3/MinIO o local), carrito, pedidos con stock transaccional, ' +
        'pagos simulados, idempotencia, simulador de escenarios, notificaciones, chat/WebSocket, ' +
        'exportaciones asíncronas (Redis/BullMQ con fallback inline), login web con cookies HttpOnly + CSRF ' +
        'y el portal del estudiante (UI en /portal, manifiesto/descargas autorizadas y bandeja propia mediada).',
    )
    .setVersion('4.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-space-id', in: 'header' }, 'space-id')
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotency-key')
    .addApiKey({ type: 'apiKey', name: 'X-CSRF-Token', in: 'header' }, 'csrf-token')
    .addCookieAuth('refresh_token')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
}
