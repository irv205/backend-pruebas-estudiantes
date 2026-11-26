import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '../src/app.configure';
import { AppModule } from '../src/app.module';
import { ensureDemoSpace } from '../src/database/demo-data';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/** Crea la aplicación real (middleware, pipes, prefijo) sobre la BD de pruebas. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  // La demo pública debe existir para las rutas /public; el seed es idempotente.
  await ensureDemoSpace(prisma);
  return { app, prisma };
}

/** Correo único por ejecución para no colisionar con seeds ni otras suites. */
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@practicas.local`;
}

export const TEST_PASSWORD = 'Prueba.12345';

/**
 * Limpieza explícita de datos de comercio antes de borrar el espacio: evita
 * chocar con la FK Restrict de OrderItem → Product (snapshots históricos).
 */
export async function cleanupCommerceSpace(
  prisma: PrismaService,
  spaceId: string,
): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({ where: { spaceId } });
  await prisma.order.deleteMany({ where: { spaceId } });
  await prisma.cartItem.deleteMany({ where: { cart: { spaceId } } });
  await prisma.cart.deleteMany({ where: { spaceId } });
  await prisma.product.deleteMany({ where: { spaceId } });
  await prisma.spaceScenarioConfig.deleteMany({ where: { spaceId } });
  await prisma.space.deleteMany({ where: { id: spaceId } });
}
