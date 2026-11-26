import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';

/**
 * Proceso worker: misma imagen y módulos que la API, pero NO escucha en HTTP.
 * Consume BullMQ (Redis) y persiste el estado en PostgreSQL. El comando se
 * selecciona en docker-compose (`npm run worker:prod` / `worker:dev`).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  await app.init();
}

void bootstrap();
