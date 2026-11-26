import { Prisma, SpaceType } from '@prisma/client';

/**
 * Datos canónicos del espacio demo público.
 * Lo usan tanto `prisma/seed.ts` como `SpacesService.resetSpace()` para que
 * reiniciar la demo siempre la devuelva al mismo estado (reset idempotente).
 *
 * Los UUIDs fijos hacen el proceso idempotente: repetir no duplica registros.
 */

type Db = Prisma.TransactionClient;

export const DEMO_SPACE_ID = 'd0000000-0000-4000-8000-000000000000';
export const DEMO_SPACE_SLUG = 'demo-publico';

const DEMO_CATEGORIES = [
  { id: 'd0000000-0000-4000-8000-00000000000a', slug: 'electronica', name: 'Electrónica' },
  { id: 'd0000000-0000-4000-8000-00000000000b', slug: 'audio', name: 'Audio' },
  { id: 'd0000000-0000-4000-8000-00000000000c', slug: 'accesorios', name: 'Accesorios' },
] as const;

const DEMO_PRODUCTS = [
  {
    id: 'd0000000-0000-4000-8000-000000000101',
    name: 'Teclado mecánico',
    description: 'Teclado mecánico compacto con interruptores intercambiables.',
    price: 49900,
    stock: 10,
    categorySlug: 'electronica',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000102',
    name: 'Mouse inalámbrico',
    description: 'Mouse ergonómico con conexión Bluetooth y 2.4 GHz.',
    price: 25900,
    stock: 25,
    categorySlug: 'electronica',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000103',
    name: 'Monitor 24" Full HD',
    description: 'Monitor IPS de 24 pulgadas, 1080p, 75 Hz.',
    price: 189900,
    stock: 7,
    categorySlug: 'electronica',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000104',
    name: 'Audífonos con cancelación de ruido',
    description: 'Audífonos over-ear con ANC y 30 h de batería.',
    price: 129900,
    stock: 12,
    categorySlug: 'audio',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000105',
    name: 'Bocina Bluetooth portátil',
    description: 'Bocina resistente al agua con 12 h de reproducción.',
    price: 79900,
    stock: 18,
    categorySlug: 'audio',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000106',
    name: 'Cable USB-C 2 m',
    description: 'Cable trenzado USB-C a USB-C, 100 W.',
    price: 12900,
    stock: 50,
    categorySlug: 'accesorios',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000107',
    name: 'Hub USB-C 6 en 1',
    description: 'HDMI, 2×USB-A, USB-C PD, lector SD y Ethernet.',
    price: 45900,
    stock: 15,
    categorySlug: 'accesorios',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000108',
    name: 'Soporte ajustable para laptop',
    description: 'Soporte de aluminio plegable con 6 niveles de altura.',
    price: 34900,
    stock: 20,
    categorySlug: 'accesorios',
  },
] as const;

/**
 * Crea (o restaura) el espacio demo con sus categorías y productos canónicos.
 * Los `update` reescriben los valores originales: sirve tanto para el seed
 * inicial como para dejar la demo como nueva tras un reset.
 */
export async function ensureDemoSpace(db: Db): Promise<{ id: string }> {
  const space = await db.space.upsert({
    where: { slug: DEMO_SPACE_SLUG },
    update: { type: SpaceType.DEMO, name: 'Demo pública' },
    create: {
      id: DEMO_SPACE_ID,
      slug: DEMO_SPACE_SLUG,
      type: SpaceType.DEMO,
      name: 'Demo pública',
    },
  });

  for (const category of DEMO_CATEGORIES) {
    await db.category.upsert({
      where: { spaceId_slug: { spaceId: space.id, slug: category.slug } },
      update: { name: category.name },
      create: { id: category.id, spaceId: space.id, slug: category.slug, name: category.name },
    });
  }

  for (const product of DEMO_PRODUCTS) {
    const category = DEMO_CATEGORIES.find((c) => c.slug === product.categorySlug)!;
    await db.product.upsert({
      where: { id: product.id },
      update: {
        spaceId: space.id,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: 'MXN',
        stock: product.stock,
        categoryId: category.id,
      },
      create: {
        id: product.id,
        spaceId: space.id,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: 'MXN',
        stock: product.stock,
        categoryId: category.id,
      },
    });
  }

  return space;
}
