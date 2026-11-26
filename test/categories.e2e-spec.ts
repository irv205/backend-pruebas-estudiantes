import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('categories');
  let token: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Categorías E2E' })
      .expect(201);
    token = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  it('CRUD con nombre único por espacio y paginación', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', auth())
      .send({ name: 'Tecnología' })
      .expect(201);
    categoryId = created.body.data.id;
    expect(created.body.data.slug).toBe('tecnologia');
    expect(created.body.data.version).toBe(1);

    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', auth())
      .send({ name: 'Tecnologia' })
      .expect(409)
      .expect((res) => expect(res.body.error.code).toBe('CATEGORY_NAME_CONFLICT'));

    const list = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', auth())
      .query({ page: 1, limit: 10 })
      .expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 10 });
    expect(list.body.data.some((c: { id: string }) => c.id === categoryId)).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', auth())
      .send({ version: 1, name: 'Tecnología actualizada' })
      .expect(200);
    expect(updated.body.data.version).toBe(2);

    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', auth())
      .send({ version: 1, name: 'Otra' })
      .expect(409)
      .expect((res) => expect(res.body.error.code).toBe('VERSION_CONFLICT'));
  });

  it('asocia productos y los lista por categoría', async () => {
    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', auth())
      .send({ name: 'Laptop', price: 100000, categoryId })
      .expect(201);
    productId = product.body.data.id;

    const byCategory = await request(app.getHttpServer())
      .get(`/api/v1/categories/${categoryId}/products`)
      .set('Authorization', auth())
      .expect(200);
    expect(byCategory.body.data.some((p: { id: string }) => p.id === productId)).toBe(true);

    const filter = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .query({ categoryId })
      .expect(200);
    expect(filter.body.data).toHaveLength(1);
  });

  it('demo pública solo lee categorías activas', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/public/categories').expect(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data.every((c: { isActive: boolean }) => c.isActive === true)).toBe(true);

    await request(app.getHttpServer())
      .post('/api/v1/public/categories')
      .send({ name: 'No permitido' })
      .expect(403);
  });

  it('elimina la categoría sin borrar el producto', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/categories/${categoryId}`)
      .set('Authorization', auth())
      .expect(204);
    const product = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(product.body.data.categoryId).toBeNull();
  });
});
