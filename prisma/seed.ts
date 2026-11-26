/**
 * Seed idempotente de la Etapa 1.
 * Repetir `npm run prisma:seed` NEVER duplica datos: todos los registros usan
 * identificadores/slug fijos y `upsert`.
 *
 * Credenciales de prueba (documentadas también en README.md):
 *   email: estudiante@practicas.local
 *   password: Estudiante.123
 */
import {
  MembershipRole,
  PrismaClient,
  ProductStatus,
  SpaceType,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { ensureDemoSpace } from '../src/database/demo-data';

const prisma = new PrismaClient();

const TEST_EMAIL = 'estudiante@practicas.local';
const TEST_PASSWORD = 'Estudiante.123';
const TEST_NAME = 'Estudiante de prueba';
const TEST_USER_ID = 'a0000000-0000-4000-8000-000000000001';
const PERSONAL_SPACE_ID = 'b0000000-0000-4000-8000-000000000001';
const PERSONAL_SPACE_SLUG = `personal-${TEST_USER_ID}`;

const CATEGORIES = [
  { id: 'c0000000-0000-4000-8000-00000000000a', slug: 'libros', name: 'Libros' },
  { id: 'c0000000-0000-4000-8000-00000000000b', slug: 'tecnologia', name: 'Tecnología' },
  { id: 'c0000000-0000-4000-8000-00000000000c', slug: 'papeleria', name: 'Papelería' },
] as const;

const PRODUCTS = [
  {
    id: 'c0000000-0000-4000-8000-000000000101',
    name: 'Clean Code',
    description: 'Manual de buenas prácticas de programación.',
    price: 45900,
    stock: 12,
    categorySlug: 'libros',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000102',
    name: 'Design Patterns',
    description: 'Patrones de diseño de software reutilizables.',
    price: 52900,
    stock: 8,
    categorySlug: 'libros',
  },
] as const;

const TASKS = [
  {
    id: 'c0000000-0000-4000-8000-000000000301',
    title: 'Configura tu cliente HTTP',
    description: 'Prueba el prefijo /api/v1 y el token Bearer con /users/me.',
    priority: TaskPriority.HIGH,
    status: TaskStatus.TODO,
    subtasks: ['Obtén un access token', 'Consulta tu perfil'],
  },
  {
    id: 'c0000000-0000-4000-8000-000000000302',
    title: 'Practica el control de versiones',
    description: 'Envía un PATCH con una versión obsoleta y observa el 409.',
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.IN_PROGRESS,
    subtasks: ['Edita una nota', 'Fuerza un conflicto 409'],
  },
  {
    id: 'c0000000-0000-4000-8000-000000000303',
    title: 'Explora el simulador de escenarios',
    description: 'Activa un escenario y documenta la respuesta esperada.',
    priority: TaskPriority.LOW,
    status: TaskStatus.TODO,
    subtasks: [] as string[],
  },
] as const;

const NOTES = [
  {
    id: 'c0000000-0000-4000-8000-000000000201',
    title: 'Bienvenido a tu espacio',
    content: 'Edita o elimina esta nota. Tus datos son privados y persistentes.',
    tags: ['bienvenida'],
    isFavorite: true,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000202',
    title: 'Prueba el control de versiones',
    content: 'Envía el campo version al hacer PATCH; si no coincide recibirás 409.',
    tags: ['ejercicio'],
  },
] as const;

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Demo pública: categorías y productos canónicos.
    await ensureDemoSpace(tx);

    const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
    await tx.user.upsert({
      where: { email: TEST_EMAIL },
      update: { name: TEST_NAME, passwordHash, isVerified: true },
      create: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        name: TEST_NAME,
        passwordHash,
        isVerified: true,
      },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });

    const space = await tx.space.upsert({
      where: { slug: PERSONAL_SPACE_SLUG },
      update: { type: SpaceType.PERSONAL, name: 'Espacio de estudio', ownerId: user.id },
      create: {
        id: PERSONAL_SPACE_ID,
        slug: PERSONAL_SPACE_SLUG,
        type: SpaceType.PERSONAL,
        name: 'Espacio de estudio',
        ownerId: user.id,
      },
    });

    await tx.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: space.id, userId: user.id } },
      update: { role: MembershipRole.ADMINISTRADOR },
      create: { spaceId: space.id, userId: user.id, role: MembershipRole.ADMINISTRADOR },
    });

    for (const category of CATEGORIES) {
      await tx.category.upsert({
        where: { spaceId_slug: { spaceId: space.id, slug: category.slug } },
        update: { name: category.name, isActive: true },
        create: { id: category.id, spaceId: space.id, slug: category.slug, name: category.name },
      });
    }
    const categoriesBySlug = new Map(
      (await tx.category.findMany({ where: { spaceId: space.id } })).map((item) => [item.slug, item]),
    );

    for (const product of PRODUCTS) {
      const categoryId = categoriesBySlug.get(product.categorySlug)!.id;
      await tx.product.upsert({
        where: { id: product.id },
        update: {
          spaceId: space.id,
          ownerId: user.id,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: 'MXN',
          stock: product.stock,
          status: ProductStatus.ACTIVE,
          categoryId,
        },
        create: {
          id: product.id,
          spaceId: space.id,
          ownerId: user.id,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: 'MXN',
          stock: product.stock,
          status: ProductStatus.ACTIVE,
          categoryId,
        },
      });
    }

    for (const task of TASKS) {
      await tx.task.upsert({
        where: { id: task.id },
        update: {
          spaceId: space.id,
          ownerId: user.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
        },
        create: {
          id: task.id,
          spaceId: space.id,
          ownerId: user.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
        },
      });
      for (const [index, title] of task.subtasks.entries()) {
        const id = `${task.id.slice(0, -1)}${String(index + 1)}`;
        await tx.subtask.upsert({
          where: { id },
          update: { taskId: task.id, title },
          create: { id, taskId: task.id, title },
        });
      }
    }

    for (const note of NOTES) {
      await tx.note.upsert({
        where: { id: note.id },
        update: {
          spaceId: space.id,
          ownerId: user.id,
          title: note.title,
          content: note.content,
          tags: [...note.tags],
          isFavorite: 'isFavorite' in note ? note.isFavorite : false,
        },
        create: {
          id: note.id,
          spaceId: space.id,
          ownerId: user.id,
          title: note.title,
          content: note.content,
          tags: [...note.tags],
          isFavorite: 'isFavorite' in note ? note.isFavorite : false,
        },
      });
    }
  });

  // eslint-disable-next-line no-console
  console.log('Seed completado (idempotente).');
  // eslint-disable-next-line no-console
  console.log(`  Demo pública: GET http://localhost:3000/api/v1/public/products`);
  // eslint-disable-next-line no-console
  console.log(`  Usuario de prueba: ${TEST_EMAIL} / ${TEST_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Error al ejecutar el seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
