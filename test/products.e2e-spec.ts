import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Products & spaces (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('products');
  let accessToken: string;
  let sandboxA: string;
  let sandboxB: string;
  let productId: string;
  let productInB: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Productos E2E' })
      .expect(201);
    accessToken = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    for (const id of [sandboxA, sandboxB]) {
      if (id) await prisma.space.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => `Bearer ${accessToken}`;
  const publicOf = (spaceId: string) => ({ 'x-space-id': spaceId });

  it('demo pública: listado paginado sin token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/products')
      .query({ page: 1, limit: 3 })
      .expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 3 });
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('demo pública es de solo lectura', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/public/products')
      .send({ name: 'No permitido', price: 100 })
      .expect(403);
  });

  it('crea dos sandboxes anónimos aislados (TTL)', async () => {
    const a = await request(app.getHttpServer()).post('/api/v1/public/sandboxes').expect(201);
    const b = await request(app.getHttpServer()).post('/api/v1/public/sandboxes').expect(201);
    sandboxA = a.body.data.spaceId;
    sandboxB = b.body.data.spaceId;
    expect(a.body.data.expiresAt).toBeDefined();
    expect(sandboxA).not.toBe(sandboxB);
  });

  it('CRUD en sandbox con paginación, filtros y conflicto 409', async () => {
    for (const name of ['Teclado', 'Mouse', 'Monitor']) {
      await request(app.getHttpServer())
        .post('/api/v1/public/products')
        .set(publicOf(sandboxA))
        .send({ name, price: 1000, stock: 5, currency: 'MXN' })
        .expect(201);
    }

    const list = await request(app.getHttpServer())
      .get('/api/v1/public/products')
      .set(publicOf(sandboxA))
      .query({ page: 1, limit: 2, sort: 'name', order: 'asc', search: 'o' })
      .expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const created = await request(app.getHttpServer())
      .post('/api/v1/public/products')
      .set(publicOf(sandboxA))
      .send({ name: 'Audífonos', price: 2500 })
      .expect(201);
    productId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/public/products/${productId}`)
      .set(publicOf(sandboxA))
      .send({ version: 1, price: 3000 })
      .expect(200);
    const conflict = await request(app.getHttpServer())
      .patch(`/api/v1/public/products/${productId}`)
      .set(publicOf(sandboxA))
      .send({ version: 1, price: 4000 })
      .expect(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');

    await request(app.getHttpServer())
      .get(`/api/v1/public/products/${productId}`)
      .set(publicOf(sandboxB))
      .expect(404);
  });

  it('valida price y stock con 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/products')
      .set(publicOf(sandboxA))
      .send({ name: 'Inválido', price: -1, stock: -2, currency: 'mxn' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('price');
    expect(res.body.error.fields).toHaveProperty('stock');
  });

  it('reiniciar A no afecta B (aislamiento por espacio)', async () => {
    const inA = await request(app.getHttpServer())
      .post('/api/v1/public/products')
      .set(publicOf(sandboxA))
      .send({ name: 'Solo en A', price: 111 })
      .expect(201);
    const idInA = inA.body.data.id;

    const inB = await request(app.getHttpServer())
      .post('/api/v1/public/products')
      .set(publicOf(sandboxB))
      .send({ name: 'Solo en B', price: 999 })
      .expect(201);
    productInB = inB.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/public/sandboxes/${sandboxA}/reset`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/public/products/${idInA}`)
      .set(publicOf(sandboxA))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/public/products/${productInB}`)
      .set(publicOf(sandboxB))
      .expect(200);
  });

  it('CRUD autenticado en el espacio personal', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', auth())
      .send({ name: 'Mi producto', price: 12345, stock: 3 })
      .expect(201);
    const id = created.body.data.id;

    const list = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .expect(200);
    expect(list.body.data.some((p: { id: string }) => p.id === id)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', auth())
      .send({ version: 1, stock: 9 })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/products/${id}`)
      .set('Authorization', auth())
      .expect(204);
  });
});
