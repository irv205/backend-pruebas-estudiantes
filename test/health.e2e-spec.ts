import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live no comprueba dependencias', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('GET /health/ready comprueba PostgreSQL', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('propaga x-request-id o genera uno nuevo', async () => {
    const generated = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);

    const propagated = await request(app.getHttpServer())
      .get('/health/live')
      .set('x-request-id', 'test-request-id-123')
      .expect(200);
    expect(propagated.headers['x-request-id']).toBe('test-request-id-123');
  });
});
