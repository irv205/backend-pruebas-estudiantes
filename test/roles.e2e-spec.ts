import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Roles en espacios de equipo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ownerEmail = uniqueEmail('owner');
  const editorEmail = uniqueEmail('editor');
  const readerEmail = uniqueEmail('reader');
  const outsiderEmail = uniqueEmail('outsider');
  const emails = [ownerEmail, editorEmail, readerEmail, outsiderEmail];
  const tokens: Record<string, string> = {};
  let spaceId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    for (const email of emails) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: TEST_PASSWORD, name: email.split('@')[0] })
        .expect(201);
      tokens[email] = res.body.data.tokens.accessToken;
    }
    const team = await request(app.getHttpServer())
      .post('/api/v1/spaces/teams')
      .set('Authorization', `Bearer ${tokens[ownerEmail]}`)
      .send({ name: 'Equipo de prácticas' })
      .expect(201);
    spaceId = team.body.data.id;

    for (const [email, role] of [
      [editorEmail, 'EDITOR'],
      [readerEmail, 'LECTOR'],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/api/v1/spaces/${spaceId}/members`)
        .set('Authorization', `Bearer ${tokens[ownerEmail]}`)
        .send({ email, role })
        .expect(201);
    }
  });

  afterAll(async () => {
    if (spaceId) await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const as = (email: string) => ({ Authorization: `Bearer ${tokens[email]}`, 'x-space-id': spaceId });

  it('el ADMINISTRADOR gestiona miembros', async () => {
    const members = await request(app.getHttpServer())
      .get(`/api/v1/spaces/${spaceId}/members`)
      .set('Authorization', `Bearer ${tokens[ownerEmail]}`)
      .expect(200);
    expect(members.body.data).toHaveLength(3);
    expect(members.body.data.map((m: { role: string }) => m.role)).toContain('LECTOR');
  });

  it('el LECTOR solo consulta: 403 al crear o editar', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(as(readerEmail))
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(as(readerEmail))
      .send({ name: 'Prohibido' })
      .expect(403)
      .expect((res) => expect(res.body.error.code).toBe('INSUFFICIENT_ROLE'));

    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set(as(readerEmail))
      .send({ title: 'Prohibido' })
      .expect(403);
  });

  it('el EDITOR crea recursos pero no gestiona miembros ni resetea', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set(as(editorEmail))
      .send({ name: 'Categoría del editor' })
      .expect(201);
    expect(created.body.data.name).toBe('Categoría del editor');

    await request(app.getHttpServer())
      .get(`/api/v1/spaces/${spaceId}/members`)
      .set(as(editorEmail))
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/spaces/${spaceId}/reset`)
      .set(as(editorEmail))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/spaces/${spaceId}/scenarios`)
      .set(as(editorEmail))
      .send({ slowResponse: true })
      .expect(403);
  });

  it('un usuario ajeno no puede usar el espacio', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(as(outsiderEmail))
      .expect(403)
      .expect((res) => expect(res.body.error.code).toBe('SPACE_ACCESS_DENIED'));
  });

  it('el ADMINISTRADOR cambia roles, remueve miembros y resetea', async () => {
    const editorUser = await prisma.user.findUniqueOrThrow({ where: { email: editorEmail } });
    const readerUser = await prisma.user.findUniqueOrThrow({ where: { email: readerEmail } });

    await request(app.getHttpServer())
      .patch(`/api/v1/spaces/${spaceId}/members/${readerUser.id}`)
      .set('Authorization', `Bearer ${tokens[ownerEmail]}`)
      .send({ role: 'EDITOR' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/spaces/${spaceId}/members/${editorUser.id}`)
      .set('Authorization', `Bearer ${tokens[ownerEmail]}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(as(editorEmail))
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/spaces/${spaceId}/reset`)
      .set('Authorization', `Bearer ${tokens[ownerEmail]}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set(as(readerEmail))
      .expect(200);
    expect(after.body.data).toHaveLength(0);
  });
});
