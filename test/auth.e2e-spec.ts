import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('auth');
  let refreshToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registra, crea espacio personal y devuelve tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Usuario E2E' })
      .expect(201);

    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    refreshToken = res.body.data.tokens.refreshToken;
    const space = await prisma.space.findFirst({ where: { ownerId: res.body.data.user.id } });
    expect(space?.type).toBe('PERSONAL');
  });

  it('rechaza un correo duplicado con 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Duplicado' })
      .expect(409);
    expect(res.body.error.code).toBe('AUTH_EMAIL_ALREADY_EXISTS');
  });

  it('inicia sesión y renueva con refresh rotatorio', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    const firstRefresh = login.body.data.tokens.refreshToken;

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    expect(refreshed.body.data.tokens.refreshToken).not.toBe(firstRefresh);
    refreshToken = refreshed.body.data.tokens.refreshToken;

    // Reutilizar el token rotado revoca la sesión completa.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('logout revoca el refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    const token = login.body.data.tokens.refreshToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: token })
      .expect(204);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token })
      .expect(401);
    expect(res.body.error.code).toBe('AUTH_REFRESH_TOKEN_REVOKED');
  });

  it('devuelve 422 con fields en datos inválidos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'no-es-correo', password: 'corta', name: 'x' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('email');
    expect(res.body.error.fields).toHaveProperty('password');
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it('credenciales incorrectas devuelven 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'PasswordIncorrecta1' })
      .expect(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });
});
