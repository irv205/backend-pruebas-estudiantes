import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupCommerceSpace,
  createTestApp,
  TEST_PASSWORD,
  uniqueEmail,
} from './utils';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  let spaceId: string;
  let productId: string;
  const email = uniqueEmail('notifications');
  const otherEmail = uniqueEmail('notifications-other');

  const auth = () => `Bearer ${token}`;
  const server = () => request(app.getHttpServer());

  async function createOrder(): Promise<string> {
    await server()
      .post('/api/v1/cart/items')
      .set('Authorization', auth())
      .send({ productId, quantity: 1 })
      .expect(201);
    const res = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', `notif-${randomUUID()}`)
      .expect(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const registered = await server()
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Notificaciones E2E' })
      .expect(201);
    token = registered.body.data.tokens.accessToken;
    const other = await server()
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: TEST_PASSWORD, name: 'Otro E2E' })
      .expect(201);
    otherToken = other.body.data.tokens.accessToken;
    spaceId = (await server().get('/api/v1/spaces/me').set('Authorization', auth()).expect(200)).body.data.id;
    productId = (
      await server()
        .post('/api/v1/products')
        .set('Authorization', auth())
        .send({ name: 'Producto notificación', price: 1000, stock: 10 })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    if (spaceId) await cleanupCommerceSpace(prisma, spaceId);
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it('genera ORDER_APPROVED al pagar y ORDER_CANCELLED al cancelar', async () => {
    const first = await createOrder();
    await server()
      .post(`/api/v1/orders/${first}/pay`)
      .set('Authorization', auth())
      .send({ outcome: 'APPROVED' })
      .expect(200);
    const second = await createOrder();
    await server().post(`/api/v1/orders/${second}/cancel`).set('Authorization', auth()).expect(200);

    const list = await server().get('/api/v1/notifications').set('Authorization', auth()).expect(200);
    const types = list.body.data.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(['ORDER_APPROVED', 'ORDER_CANCELLED']));
    expect(list.body.data.every((n: { spaceId: string; userId: string }) => n.spaceId === spaceId && n.userId)).toBe(true);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('filtra no leídas, cuenta, detalla y marca como leída', async () => {
    const count = await server()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', auth())
      .expect(200);
    expect(count.body.data.count).toBeGreaterThanOrEqual(2);

    const unread = await server()
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', auth())
      .expect(200);
    expect(unread.body.data.length).toBe(count.body.data.count);

    const id = unread.body.data[0].id as string;
    const detail = await server()
      .get(`/api/v1/notifications/${id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.data).toMatchObject({ id, isRead: false, readAt: null });

    const read = await server()
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', auth())
      .expect(200);
    expect(read.body.data.isRead).toBe(true);
    expect(read.body.data.readAt).toBeTruthy();

    const after = await server()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', auth())
      .expect(200);
    expect(after.body.data.count).toBe(count.body.data.count - 1);
  });

  it('read-all marca todas y nunca expone notificaciones de otro usuario', async () => {
    const all = await server().get('/api/v1/notifications').set('Authorization', auth()).expect(200);
    const id = all.body.data[0].id as string;
    await server()
      .get(`/api/v1/notifications/${id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    const result = await server()
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', auth())
      .expect(200);
    expect(result.body.data.updated).toBeGreaterThanOrEqual(1);
    const after = await server()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', auth())
      .expect(200);
    expect(after.body.data.count).toBe(0);
  });
});
