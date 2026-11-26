import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Users / profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('users');
  let accessToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Perfil E2E' })
      .expect(201);
    accessToken = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => `Bearer ${accessToken}`;

  it('GET /users/me devuelve el perfil y el espacio', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.space.type).toBe('PERSONAL');
  });

  it('sin token devuelve 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('PATCH /users/me actualiza el nombre', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', auth())
      .send({ name: 'Nombre Actualizado' })
      .expect(200);
    expect(res.body.data.name).toBe('Nombre Actualizado');
  });

  it('PATCH /users/me rechaza avatarUrl inválido con 422', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', auth())
      .send({ avatarUrl: 'esto no es una url' })
      .expect(422);
    expect(res.body.error.fields).toHaveProperty('avatarUrl');
  });

  it('PUT /users/me/password cambia la contraseña', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/users/me/password')
      .set('Authorization', auth())
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Nueva.Clave987' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Nueva.Clave987' })
      .expect(200);
  });

  it('DELETE /users/me elimina la cuenta (cascada)', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', auth())
      .send({ password: 'Nueva.Clave987' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', auth())
      .expect(404);
  });
});
