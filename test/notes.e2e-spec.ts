import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Notes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('notes');
  let accessToken: string;
  let noteId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Notas E2E' })
      .expect(201);
    accessToken = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => `Bearer ${accessToken}`;

  it('crea una nota', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/notes')
      .set('Authorization', auth())
      .send({ title: 'Primera nota', content: 'Contenido de prueba', tags: ['e2e'], isFavorite: true })
      .expect(201);
    expect(res.body.data.title).toBe('Primera nota');
    expect(res.body.data.version).toBe(1);
    noteId = res.body.data.id;
  });

  it('lista paginado y filtra por etiqueta y favoritas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notes')
      .query({ page: 1, limit: 5, tags: 'e2e', isFavorite: 'true' })
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5, total: 1, totalPages: 1 });
    expect(res.body.data[0].id).toBe(noteId);
  });

  it('busca por título o contenido', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notes')
      .query({ search: 'PRIMERA' })
      .set('Authorization', auth())
      .expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('PATCH con versión correcta incrementa la versión', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/notes/${noteId}`)
      .set('Authorization', auth())
      .send({ version: 1, title: 'Nota editada' })
      .expect(200);
    expect(res.body.data.version).toBe(2);
  });

  it('PATCH con versión obsoleta devuelve 409', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/notes/${noteId}`)
      .set('Authorization', auth())
      .send({ version: 1, title: 'Edición perdida' })
      .expect(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('valida los datos de entrada con 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/notes')
      .set('Authorization', auth())
      .send({ title: '', tags: 'no-es-array' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('title');
  });

  it('elimina la nota y luego devuelve 404', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/notes/${noteId}`)
      .set('Authorization', auth())
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/notes/${noteId}`)
      .set('Authorization', auth())
      .expect(404);
  });
});
