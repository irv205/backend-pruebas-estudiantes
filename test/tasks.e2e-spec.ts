import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, TEST_PASSWORD, uniqueEmail } from './utils';

describe('Tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('tasks');
  let token: string;
  let taskId: string;
  let subtaskId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Tareas E2E' })
      .expect(201);
    token = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  it('crea tarea con subtareas y aplica filtros', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', auth())
      .send({
        title: 'Preparar entorno',
        description: 'Instalar dependencias',
        priority: 'HIGH',
        status: 'TODO',
        dueAt: '2030-01-01T00:00:00.000Z',
        subtasks: [{ title: 'Node 20' }, { title: 'Docker' }],
      })
      .expect(201);
    taskId = created.body.data.id;
    expect(created.body.data.subtasks).toHaveLength(2);
    subtaskId = created.body.data.subtasks[0].id;

    const filtered = await request(app.getHttpServer())
      .get('/api/v1/tasks')
      .set('Authorization', auth())
      .query({ status: 'TODO', priority: 'HIGH', dueBefore: '2031-01-01T00:00:00.000Z' })
      .expect(200);
    expect(filtered.body.data.some((t: { id: string }) => t.id === taskId)).toBe(true);

    const byStatus = await request(app.getHttpServer())
      .get('/api/v1/tasks')
      .set('Authorization', auth())
      .query({ status: 'DONE' })
      .expect(200);
    expect(byStatus.body.data.some((t: { id: string }) => t.id === taskId)).toBe(false);
  });

  it('valida transiciones y versión', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ version: 1, status: 'DONE' })
      .expect(409)
      .expect((res) => expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION'));

    const moved = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ version: 1, status: 'IN_PROGRESS' })
      .expect(200);
    expect(moved.body.data.version).toBe(2);

    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ version: 1, title: 'Obsoleta' })
      .expect(409)
      .expect((res) => expect(res.body.error.code).toBe('VERSION_CONFLICT'));

    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', auth())
      .send({ version: 2, status: 'DONE' })
      .expect(200);
  });

  it('gestiona subtareas', async () => {
    const added = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/subtasks`)
      .set('Authorization', auth())
      .send({ title: 'Tercera' })
      .expect(201);
    expect(added.body.data.subtasks).toHaveLength(3);

    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', auth())
      .send({ isDone: true })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/tasks/${taskId}/subtasks/${subtaskId}`)
      .set('Authorization', auth())
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/api/v1/tasks/${taskId}`)
      .set('Authorization', auth())
      .expect(204);
  });
});
