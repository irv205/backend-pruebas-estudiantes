import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Portal del estudiante (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let email: string;
  let accessToken: string;
  let spaceId: string;
  const server = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    email = uniqueEmail('portal');
    const registered = await server()
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Portal E2E' })
      .expect(201);
    accessToken = registered.body.data.tokens.accessToken;
    spaceId = (
      await server().get('/api/v1/spaces/me').set('Authorization', `Bearer ${accessToken}`).expect(200)
    ).body.data.id;
  });

  afterAll(async () => {
    await prisma.space.deleteMany({ where: { id: spaceId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('sirve /portal y sus assets sin romper Swagger ni health', async () => {
    const page = await server().get('/portal').expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('Portal del estudiante');
    await server().get('/portal/assets/app.js').expect(200);
    await server().get('/portal/assets/styles.css').expect(200);
    await server().get('/docs').expect(200);
    await server().get('/health/live').expect(200);
    await server().get('/api/v1/portal/manifest').expect(401);
  });

  it('manifest expone URLs, 12 escenarios y niveles 0-6', async () => {
    const res = await server()
      .get('/api/v1/portal/manifest')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const data = res.body.data;
    // Campos nuevos (raíz única + WS) sin romper los contratos existentes.
    expect(data.baseUrl).toMatch(/^https?:\/\//);
    expect(data.baseUrl).not.toContain('/api/v1');
    expect(data.tunnelUrl).toBe(data.baseUrl);
    expect(data.wsBaseUrl).toMatch(/^(wss?):\/\//);
    expect(data.apiBaseUrl).toBe(`${data.baseUrl}/api/v1`);
    expect(data.apiBaseUrl).toContain('/api/v1');
    expect(data.swaggerUrl).toContain('/docs');
    expect(data.downloads.collection).toContain('/portal/postman/collection');
    expect(data.scenarios).toHaveLength(12);
    expect(data.scenarios.map((item: { key: string }) => item.key)).toContain('failedAsyncJob');
    expect(data.challenges.map((item: { level: number }) => item.level)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(data.challenges[1].examples).toHaveProperty('curl');
    expect(data.challenges[1].examples).toHaveProperty('javascript');
    expect(data.challenges[1].examples).toHaveProperty('kotlin');
  });

  it('lista espacios seleccionables y la guía en Markdown', async () => {
    const spaces = await server()
      .get('/api/v1/portal/spaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(spaces.body.data.activeSpaceId).toBe(spaceId);
    expect(spaces.body.data.spaces.some((space: { type: string }) => space.type === 'PERSONAL')).toBe(true);

    const guide = await server()
      .get('/api/v1/portal/guide')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(guide.headers['content-type']).toContain('text/markdown');
    expect(guide.text).toContain('Nivel 0');
  });

  it('descarga los JSON de Postman solo con Bearer', async () => {
    await server().get('/api/v1/portal/postman/collection').expect(401);

    const collection = await server()
      .get('/api/v1/portal/postman/collection')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(collection.headers['content-disposition']).toContain('postman_collection.json');
    expect(collection.body.info.name).toContain('Backend de prácticas');

    const environment = await server()
      .get('/api/v1/portal/postman/environment')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(environment.headers['content-disposition']).toContain('postman_environment.json');
    expect(environment.body.name).toContain('Backend Prácticas');
  });

  it('/mail/me filtra por el correo del usuario y no filtra otros mensajes', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messages_count: 2,
        messages: [
          {
            ID: 'own-1',
            Subject: 'Verifica tu correo',
            From: { Address: 'no-reply@practicas.local' },
            To: [{ Address: email }],
            Created: '2026-01-01T00:00:00.000Z',
            Read: false,
            Attachments: 0,
            Snippet: 'token-no-debe-filtrarse',
          },
          {
            ID: 'other-1',
            Subject: 'Correo de otro estudiante',
            From: { Address: 'no-reply@practicas.local' },
            To: [{ Address: 'otro-estudiante@practicas.local' }],
            Created: '2026-01-01T00:00:00.000Z',
            Read: false,
            Attachments: 0,
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const res = await server()
        .get('/api/v1/mail/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.email).toBe(email);
      expect(res.body.data.count).toBe(1);
      expect(res.body.data.messages).toHaveLength(1);
      expect(res.body.data.messages[0].id).toBe('own-1');
      expect(JSON.stringify(res.body)).not.toContain('otro-estudiante@practicas.local');
      expect(JSON.stringify(res.body)).not.toContain('token-no-debe-filtrarse');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain(`query=to%3A${encodeURIComponent(email)}`);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('/mail/me sin Bearer responde 401', async () => {
    await server().get('/api/v1/mail/me').expect(401);
  });
});
