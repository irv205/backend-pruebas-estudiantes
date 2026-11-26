import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

type Jar = Record<string, string>;

function cookiesOf(res: { headers: Record<string, unknown> }): string[] {
  const value = res.headers['set-cookie'];
  return Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
}

function updateJar(jar: Jar, res: { headers: Record<string, unknown> }): void {
  for (const line of cookiesOf(res)) {
    const pair = line.split(';')[0];
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (/Max-Age=0/i.test(line)) delete jar[name];
    else jar[name] = value;
  }
}

function cookieHeader(jar: Jar): string {
  return Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ');
}

describe('Web auth: cookies HttpOnly + CSRF (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let email: string;
  let accessToken: string;
  let spaceId: string;
  const jar: Jar = {};
  const server = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    email = uniqueEmail('web-auth');
    const registered = await server()
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Web Auth E2E' })
      .expect(201);
    accessToken = registered.body.data.tokens.accessToken;
    spaceId = (await server().get('/api/v1/spaces/me').set('Authorization', `Bearer ${accessToken}`).expect(200)).body.data.id;
  });

  afterAll(async () => {
    await prisma.space.deleteMany({ where: { id: spaceId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('web/login devuelve access token y cookies HttpOnly con Path y SameSite', async () => {
    const res = await server()
      .post('/api/v1/auth/web/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    updateJar(jar, res);
    const cookies = cookiesOf(res);
    const refresh = cookies.find((c) => c.startsWith('refresh_token=')) ?? '';
    const csrf = cookies.find((c) => c.startsWith('csrf_token=')) ?? '';
    expect(refresh).toContain('HttpOnly');
    expect(refresh).toContain('SameSite=Lax');
    expect(refresh).toContain('Path=/api/v1');
    expect(csrf).toContain('HttpOnly');
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeUndefined();
    expect(res.body.data.csrfToken).toBeTruthy();
  });

  it('csrf devuelve un token double-submit y refuerza la cookie', async () => {
    const res = await server().get('/api/v1/auth/csrf').expect(200);
    updateJar(jar, res);
    expect(res.body.data.csrfToken).toBeTruthy();
    expect(jar.csrf_token).toBe(res.body.data.csrfToken);
  });

  it('exige X-CSRF-Token en mutaciones con cookie de sesión', async () => {
    await server()
      .post('/api/v1/auth/web/refresh')
      .set('Cookie', cookieHeader(jar))
      .expect(403)
      .expect((res) => expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID'));

    const rotated = await server()
      .post('/api/v1/auth/web/refresh')
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', jar.csrf_token)
      .expect(200);
    updateJar(jar, rotated);
    expect(rotated.body.data.tokens.accessToken).toBeTruthy();
    expect(rotated.body.data.csrfToken).toBe(jar.csrf_token);
  });

  it('las rutas Bearer siguen igual aunque haya cookies de sesión', async () => {
    const res = await server()
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookieHeader(jar))
      .send({ title: 'Nota con cookie presente', content: 'Bearer manda' })
      .expect(201);
    expect(res.body.data.title).toBe('Nota con cookie presente');
  });

  it('logout revoca la sesión y limpia las cookies', async () => {
    await server()
      .post('/api/v1/auth/web/logout')
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', jar.csrf_token)
      .expect(204);
    updateJar(jar, { headers: { 'set-cookie': [
      'refresh_token=; Max-Age=0; Path=/api/v1',
      'csrf_token=; Max-Age=0; Path=/api/v1',
    ] } });
    expect(jar.refresh_token).toBeUndefined();

    await server()
      .post('/api/v1/auth/web/refresh')
      .set('Cookie', cookieHeader(jar))
      .set('X-CSRF-Token', jar.csrf_token ?? '')
      .expect(401);
  });
});
