import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { validationExceptionFactory } from './common/validation/validation-exception';

/**
 * Configuración compartida con las pruebas e2e: así los tests ejercitan el
 * mismo prefijo, validación y CORS que la aplicación real.
 * Se mantiene fuera de main.ts para que importarlo no arranque un servidor.
 */
export function configureApp(app: INestApplication): void {
  // Contrato §9: /api/v1 para la API; /health queda fuera del prefijo.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)'] });

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
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-space-id', 'x-request-id', 'Idempotency-Key'],
  });

  const swagger = new DocumentBuilder()
    .setTitle('Backend de práctica para estudiantes')
    .setDescription(
      'API REST de práctica (Etapas 1-3). Prefijo `/api/v1`. Usa `x-space-id` para el sandbox ' +
        'anónimo en `/public/*` o para seleccionar un espacio de equipo; usa ' +
        '`Authorization: Bearer <accessToken>` para el espacio personal. Incluye categorías, ' +
        'tareas, roles, archivos (S3/MinIO o local), carrito, pedidos con stock transaccional, ' +
        'pagos simulados, idempotencia y simulador de escenarios por espacio.',
    )
    .setVersion('3.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-space-id', in: 'header' }, 'space-id')
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotency-key')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
}
