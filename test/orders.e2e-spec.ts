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

describe('Cart & Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let otherToken: string;
  let spaceId: string;
  let productA: string;
  let productB: string;
  let productUsd: string;
  let orderId: string;
  const email = uniqueEmail('orders');
  const otherEmail = uniqueEmail('orders-other');

  const auth = () => `Bearer ${accessToken}`;
  const server = () => request(app.getHttpServer());
  const stockOf = async (id: string): Promise<number> =>
    (await prisma.product.findUniqueOrThrow({ where: { id }, select: { stock: true } })).stock;

  async function createProduct(name: string, price: number, stock: number, currency = 'MXN') {
    const res = await server()
      .post('/api/v1/products')
      .set('Authorization', auth())
      .send({ name, price, stock, currency })
      .expect(201);
    return res.body.data.id as string;
  }

  const addToCart = (productId: string, quantity: number) =>
    server()
      .post('/api/v1/cart/items')
      .set('Authorization', auth())
      .send({ productId, quantity })
      .expect(201);

  const orderKey = () => `key-${randomUUID()}`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const registered = await server()
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Pedidos E2E' })
      .expect(201);
    accessToken = registered.body.data.tokens.accessToken;

    const other = await server()
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: TEST_PASSWORD, name: 'Otro usuario E2E' })
      .expect(201);
    otherToken = other.body.data.tokens.accessToken;

    const me = await server().get('/api/v1/spaces/me').set('Authorization', auth()).expect(200);
    spaceId = me.body.data.id;

    productA = await createProduct('Producto A', 1000, 10);
    productB = await createProduct('Producto B', 250, 3);
    productUsd = await createProduct('Producto USD', 500, 5, 'USD');
  });

  afterAll(async () => {
    if (spaceId) await cleanupCommerceSpace(prisma, spaceId);
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it('GET /cart devuelve carrito vacío con totales del servidor', async () => {
    const res = await server().get('/api/v1/cart').set('Authorization', auth()).expect(200);
    expect(res.body.data).toMatchObject({ currency: null, itemCount: 0, subtotal: 0, total: 0 });
    expect(res.body.data.items).toEqual([]);
    expect(res.body.meta).toMatchObject({ total: 0, itemCount: 0 });
  });

  it('valida el carrito con 422 y producto ajeno/inexistente con 404', async () => {
    await server()
      .post('/api/v1/cart/items')
      .set('Authorization', auth())
      .send({ productId: 'no-uuid', quantity: 1 })
      .expect(422);
    await server()
      .post('/api/v1/cart/items')
      .set('Authorization', auth())
      .send({ productId: productA, quantity: 0 })
      .expect(422);
    await server()
      .post('/api/v1/cart/items')
      .set('Authorization', auth())
      .send({ productId: randomUUID(), quantity: 1 })
      .expect(404);
  });

  it('añade items y calcula totales en servidor (nunca en el cliente)', async () => {
    await addToCart(productA, 2);
    await addToCart(productB, 1);
    const res = await server().get('/api/v1/cart').set('Authorization', auth()).expect(200);
    expect(res.body.data).toMatchObject({
      currency: 'MXN',
      itemCount: 3,
      subtotal: 2250,
      total: 2250,
    });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].product).toMatchObject({ id: productA, price: 1000 });
    expect(res.body.data.items[0]).toMatchObject({ quantity: 2, unitPrice: 1000, subtotal: 2000 });
  });

  it('acepta una sola moneda y valida stock al añadir/cambiar cantidad', async () => {
    const mismatch = await server()
      .post('/api/v1/cart/items')
      .set('Authorization', auth())
      .send({ productId: productUsd, quantity: 1 })
      .expect(409);
    expect(mismatch.body.error.code).toBe('CURRENCY_MISMATCH');

    const tooMany = await server()
      .patch(`/api/v1/cart/items/${productB}`)
      .set('Authorization', auth())
      .send({ quantity: 99 })
      .expect(409);
    expect(tooMany.body.error.code).toBe('INSUFFICIENT_STOCK');

    const patched = await server()
      .patch(`/api/v1/cart/items/${productA}`)
      .set('Authorization', auth())
      .send({ quantity: 2 })
      .expect(200);
    expect(patched.body.data.total).toBe(2250);
  });

  it('crea pedido: descuenta stock, guarda snapshot y vacía el carrito', async () => {
    const key = 'idem-key-1';
    const res = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', key)
      .expect(201);
    expect(res.body.data).toMatchObject({
      status: 'PENDING_PAYMENT',
      currency: 'MXN',
      total: 2250,
      idempotencyKey: key,
      version: 1,
    });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: productA, unitPrice: 1000, quantity: 2, name: 'Producto A' }),
        expect.objectContaining({ productId: productB, unitPrice: 250, quantity: 1, name: 'Producto B' }),
      ]),
    );
    expect(res.body.data.payments).toEqual([]);
    orderId = res.body.data.id;

    expect(await stockOf(productA)).toBe(8);
    expect(await stockOf(productB)).toBe(2);
    const cart = await server().get('/api/v1/cart').set('Authorization', auth()).expect(200);
    expect(cart.body.data.items).toEqual([]);
    expect(cart.body.data.total).toBe(0);
  });

  it('exige Idempotency-Key (422) y rechaza carrito vacío (409)', async () => {
    const missing = await server().post('/api/v1/orders').set('Authorization', auth()).expect(422);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(missing.body.error.fields).toHaveProperty('Idempotency-Key');

    const empty = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'empty-cart-key')
      .expect(409);
    expect(empty.body.error.code).toBe('EMPTY_CART');
    expect(await prisma.order.count({ where: { idempotencyKey: 'empty-cart-key' } })).toBe(0);
  });

  it('idempotencia: misma clave devuelve el mismo pedido sin descontar stock dos veces', async () => {
    const res = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'idem-key-1')
      .expect(201);
    expect(res.body.data.id).toBe(orderId);
    expect(res.body.data.status).toBe('PENDING_PAYMENT');
    expect(res.body.data.total).toBe(2250);
    expect(await stockOf(productA)).toBe(8);
    expect(await stockOf(productB)).toBe(2);
    expect(await prisma.order.count({ where: { idempotencyKey: 'idem-key-1' } })).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { key: 'idem-key-1', spaceId } })).toBe(1);
  });

  it('lista pedidos paginado, filtra por status y valida la query', async () => {
    const list = await server()
      .get('/api/v1/orders')
      .set('Authorization', auth())
      .query({ page: 1, limit: 5 })
      .expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 5, total: 1 });
    expect(list.body.data[0].id).toBe(orderId);

    const paid = await server()
      .get('/api/v1/orders')
      .set('Authorization', auth())
      .query({ status: 'PAID' })
      .expect(200);
    expect(paid.body.data).toEqual([]);

    const invalid = await server()
      .get('/api/v1/orders')
      .set('Authorization', auth())
      .query({ status: 'ENVIADO' })
      .expect(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('detalle con ítems y pagos; UUID inválido 422 y desconocido 404', async () => {
    const detail = await server()
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.data.id).toBe(orderId);
    expect(detail.body.data.items).toHaveLength(2);

    await server().get('/api/v1/orders/no-uuid').set('Authorization', auth()).expect(422);
    await server()
      .get(`/api/v1/orders/${randomUUID()}`)
      .set('Authorization', auth())
      .expect(404);
  });

  it('otro usuario no ve el pedido (aislamiento por propietario)', async () => {
    const res = await server()
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    const list = await server()
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(list.body.data).toEqual([]);
  });

  it('PENDING mantiene PENDING_PAYMENT y registra un intento', async () => {
    const res = await server()
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('Authorization', auth())
      .send({ outcome: 'PENDING' })
      .expect(200);
    expect(res.body.data.status).toBe('PENDING_PAYMENT');
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0]).toMatchObject({ outcome: 'PENDING', attempt: 1 });
    expect(await stockOf(productA)).toBe(8); // unchanged

    const invalid = await server()
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('Authorization', auth())
      .send({ outcome: 'DECLINED' })
      .expect(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('APPROVED marca PAID sin tocar stock y bloquea un segundo pago', async () => {
    const res = await server()
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('Authorization', auth())
      .send({ outcome: 'APPROVED' })
      .expect(200);
    expect(res.body.data).toMatchObject({ status: 'PAID', version: 3 });
    expect(res.body.data.payments).toHaveLength(2);
    expect(res.body.data.payments[1]).toMatchObject({ outcome: 'APPROVED', attempt: 2 });
    expect(await stockOf(productA)).toBe(8);

    const again = await server()
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('Authorization', auth())
      .send({ outcome: 'APPROVED' })
      .expect(409);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(await prisma.paymentSimulation.count({ where: { orderId } })).toBe(2);
  });

  it('cancelar un pedido PAID repone stock una sola vez', async () => {
    const res = await server()
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED', stockRestored: true });
    expect(await stockOf(productA)).toBe(10);
    expect(await stockOf(productB)).toBe(3);

    const again = await server()
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', auth())
      .expect(409);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(await stockOf(productA)).toBe(10);
    expect(await stockOf(productB)).toBe(3);
  });

  it('REJECTED marca FAILED y repone stock; no se puede cancelar después', async () => {
    await addToCart(productA, 2);
    const created = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'idem-key-2')
      .expect(201);
    const failedId = created.body.data.id as string;
    expect(await stockOf(productA)).toBe(8);

    const paid = await server()
      .post(`/api/v1/orders/${failedId}/pay`)
      .set('Authorization', auth())
      .send({ outcome: 'REJECTED' })
      .expect(200);
    expect(paid.body.data.status).toBe('FAILED');
    expect(paid.body.data.payments[0]).toMatchObject({ outcome: 'REJECTED', attempt: 1 });
    expect(await stockOf(productA)).toBe(10);

    const cancel = await server()
      .post(`/api/v1/orders/${failedId}/cancel`)
      .set('Authorization', auth())
      .expect(409);
    expect(cancel.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(await stockOf(productA)).toBe(10);
  });

  it('cancelar desde PENDING_PAYMENT repone stock y bloquea el pago posterior', async () => {
    await addToCart(productA, 1);
    const created = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'idem-key-3')
      .expect(201);
    const cancelledId = created.body.data.id as string;
    expect(await stockOf(productA)).toBe(9);
    await server()
      .post(`/api/v1/orders/${cancelledId}/cancel`)
      .set('Authorization', auth())
      .expect(200);
    expect(await stockOf(productA)).toBe(10);

    const pay = await server()
      .post(`/api/v1/orders/${cancelledId}/pay`)
      .set('Authorization', auth())
      .send({ outcome: 'APPROVED' })
      .expect(409);
    expect(pay.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('sin stock suficiente no crea pedido ni deja stock negativo', async () => {
    const cart = await prisma.cart.findUniqueOrThrow({
      where: { spaceId_userId: { spaceId, userId: (await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      })).id } },
    });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: productA, quantity: 11 },
    });
    const res = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'idem-key-4')
      .expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(productA)).toBe(10);
    expect(await prisma.order.count({ where: { idempotencyKey: 'idem-key-4' } })).toBe(0);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  });

  it('el precio comprado es snapshot: cambiar el precio no altera el pedido', async () => {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productA },
      select: { version: true },
    });
    await server()
      .patch(`/api/v1/products/${productA}`)
      .set('Authorization', auth())
      .send({ version: product.version, price: 1500 })
      .expect(200);

    const detail = await server()
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.data.total).toBe(2250);
    expect(detail.body.data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ productId: productA, unitPrice: 1000 })]),
    );

    await addToCart(productA, 1);
    const cart = await server().get('/api/v1/cart').set('Authorization', auth()).expect(200);
    expect(cart.body.data.total).toBe(1500); // el carrito sí usa el precio vigente
    await server().delete('/api/v1/cart').set('Authorization', auth()).expect(204);
  });

  it('simulador duplicateOrder: misma clave forzada, un solo pedido', async () => {
    const activated = await server()
      .patch('/api/v1/spaces/me/scenarios')
      .set('Authorization', auth())
      .send({ duplicateOrder: true })
      .expect(200);
    expect(activated.body.data.scenarios.duplicateOrder.active).toBe(true);

    await addToCart(productA, 1);
    const first = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'client-key-ignored')
      .expect(201);
    const duplicatedId = first.body.data.id as string;
    const stockAfterFirst = await stockOf(productA);

    const second = await server()
      .post('/api/v1/orders')
      .set('Authorization', auth())
      .set('Idempotency-Key', 'client-key-ignored')
      .expect(201);
    expect(second.body.data.id).toBe(duplicatedId);
    expect(second.body.data.status).toBe(first.body.data.status);
    expect(await stockOf(productA)).toBe(stockAfterFirst);
    expect(
      await prisma.idempotencyRecord.count({
        where: { key: `duplicate-order-${spaceId}`, spaceId },
      }),
    ).toBe(1);

    await server()
      .patch('/api/v1/spaces/me/scenarios')
      .set('Authorization', auth())
      .send({ duplicateOrder: false })
      .expect(200);
  });
});
