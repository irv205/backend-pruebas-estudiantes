import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Simulador de escenarios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('scenarios');
  let token: string;
  let taskId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Simulador E2E' })
      .expect(201);
    token = res.body.data.tokens.accessToken;
    const task = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', auth())
      .send({ title: 'Tarea para conflictos' })
      .expect(201);
    taskId = task.body.data.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => `Bearer ${token}`;
  const set = async (scenario: string, value: boolean) => {
    await request(app.getHttpServer())
      .patch('/api/v1/spaces/me/scenarios')
      .set('Authorization', auth())
      .send({ [scenario]: value })
      .expect(200);
  };

  it('por defecto la API está estable', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/spaces/me/scenarios')
      .set('Authorization', auth())
      .expect(200);
    const scenarios = res.body.data.scenarios;
    expect(
      (Object.values(scenarios) as Array<{ active: boolean }>).every((s) => s.active === false),
    ).toBe(true);
    await request(app.getHttpServer()).get('/api/v1/products').set('Authorization', auth()).expect(200);
  });

  it('503 temporal y 401 de sesión vencida', async () => {
    await set('temporary503', true);
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .expect(503)
      .expect((res) => expect(res.body.error.code).toBe('SIMULATED_503'));
    await set('temporary503', false);

    await set('sessionExpired', true);
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .expect(401)
      .expect((res) => expect(res.body.error.code).toBe('AUTH_TOKEN_EXPIRED'));
    await set('sessionExpired', false);
  });

  it('permiso insuficiente y edición simultánea', async () => {
    await set('insufficientPermission', true);
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .expect(403)
      .expect((res) => expect(res.body.error.code).toBe('INSUFFICIENT_ROLE'));
    await set('insufficientPermission', false);

    await set('concurrentEdit', true);
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ version: 1, title: 'Conflicto' })
      .expect(409)
      .expect((res) => expect(res.body.error.code).toBe('VERSION_CONFLICT'));
    await set('concurrentEdit', false);
  });

  it('lista vacía, gran volumen y límite con Retry-After', async () => {
    await set('emptyList', true);
    const empty = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .expect(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.meta.total).toBe(0);
    await set('emptyList', false);

    await set('largeVolume', true);
    const large = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .expect(200);
    expect(large.body.data.length).toBeGreaterThanOrEqual(10);
    expect(large.body.meta.total).toBe(large.body.data.length);
    await set('largeVolume', false);

    await set('rateLimit', true);
    const limited = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', auth())
      .expect(429);
    expect(limited.headers['retry-after']).toBe('5');
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    await set('rateLimit', false);
  });

  it('archivo inválido y latencia controlada', async () => {
    await set('invalidFile', true);
    await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', auth())
      .attach('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' })
      .expect(400)
      .expect((res) => expect(res.body.error.code).toBe('INVALID_FILE_TYPE'));
    await set('invalidFile', false);

    await set('slowResponse', true);
    const started = Date.now();
    await request(app.getHttpServer()).get('/api/v1/products').set('Authorization', auth()).expect(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
    await set('slowResponse', false);

    await set('timeout', true);
    const before = Date.now();
    await request(app.getHttpServer()).get('/api/v1/products').set('Authorization', auth()).expect(200);
    expect(Date.now() - before).toBeGreaterThanOrEqual(1500);
    await set('timeout', false);

    await request(app.getHttpServer()).get('/api/v1/products').set('Authorization', auth()).expect(200);
  });
});
