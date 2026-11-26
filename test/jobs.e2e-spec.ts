import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JobsQueueService } from '../src/jobs/jobs.queue';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupCommerceSpace,
  createTestApp,
  TEST_PASSWORD,
  uniqueEmail,
} from './utils';

describe('Export jobs (e2e, inline)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  let spaceId: string;
  const email = uniqueEmail('jobs');
  const otherEmail = uniqueEmail('jobs-other');

  const auth = () => `Bearer ${token}`;
  const server = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const registered = await server()
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Jobs E2E' })
      .expect(201);
    token = registered.body.data.tokens.accessToken;
    const other = await server()
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: TEST_PASSWORD, name: 'Otro Jobs E2E' })
      .expect(201);
    otherToken = other.body.data.tokens.accessToken;
    spaceId = (await server().get('/api/v1/spaces/me').set('Authorization', auth()).expect(200)).body.data.id;

    await server()
      .post('/api/v1/products')
      .set('Authorization', auth())
      .send({ name: 'Producto, "CSV"', price: 1234, stock: 3 })
      .expect(201);
    await server()
      .post('/api/v1/notes')
      .set('Authorization', auth())
      .send({ title: 'Nota archivada', content: 'línea 1\nlínea 2', isArchived: true })
      .expect(201);
    await server()
      .post('/api/v1/notes')
      .set('Authorization', auth())
      .send({ title: 'Nota activa', content: 'visible' })
      .expect(201);
  });

  afterAll(async () => {
    if (spaceId) {
      await prisma.exportJob.deleteMany({ where: { spaceId } });
      await cleanupCommerceSpace(prisma, spaceId);
    }
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  async function createJob(kind: string, filters?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await server()
      .post('/api/v1/jobs/exports')
      .set('Authorization', auth())
      .send({ kind, ...(filters ? { filters } : {}) })
      .expect(201);
    return res.body.data as Record<string, unknown>;
  }

  it('valida kind y filtros', async () => {
    await server()
      .post('/api/v1/jobs/exports')
      .set('Authorization', auth())
      .send({ kind: 'PDF' })
      .expect(422);
    await server()
      .post('/api/v1/jobs/exports')
      .set('Authorization', auth())
      .send({ kind: 'PRODUCTS_CSV', filters: { categoryId: 'no-uuid' } })
      .expect(422);
  });

  it('exporta productos a CSV con escaping y permite descargar el archivo', async () => {
    const job = await createJob('PRODUCTS_CSV', { search: 'CSV' });
    expect(job).toMatchObject({ kind: 'PRODUCTS_CSV', status: 'COMPLETED', progress: 100 });
    expect(job.fileObjectId).toBeTruthy();

    const detail = await server()
      .get(`/api/v1/jobs/exports/${job.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(detail.body.data).toMatchObject({ status: 'COMPLETED' });

    const download = await server()
      .get(`/api/v1/jobs/exports/${job.id}/download`)
      .set('Authorization', auth())
      .expect(200);
    expect(download.headers['content-type']).toContain('text/csv');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.text).toContain('name,price,currency');
    expect(download.text).toContain('"Producto, ""CSV"""');
  });

  it('aplica filtros en exportaciones de notas y genera notificación de éxito', async () => {
    const job = await createJob('NOTES_CSV', { isArchived: true });
    expect(job).toMatchObject({ kind: 'NOTES_CSV', status: 'COMPLETED' });
    const download = await server()
      .get(`/api/v1/jobs/exports/${job.id}/download`)
      .set('Authorization', auth())
      .expect(200);
    expect(download.text).toContain('Nota archivada');
    expect(download.text).not.toContain('Nota activa');

    const notes = await server()
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', auth())
      .expect(200);
    expect(notes.body.data.map((n: { type: string }) => n.type)).toContain('JOB_COMPLETED');
  });

  it('lista paginado por espacio y protege trabajos ajenos', async () => {
    const list = await server()
      .get('/api/v1/jobs/exports?status=COMPLETED&limit=1')
      .set('Authorization', auth())
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(2);

    const job = await createJob('PRODUCTS_CSV');
    await server()
      .get(`/api/v1/jobs/exports/${job.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await server()
      .get(`/api/v1/jobs/exports/${job.id}/download`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('rechaza descargar un trabajo que no está COMPLETED', async () => {
    const pending = await prisma.exportJob.create({
      data: { spaceId, ownerId: (await prisma.space.findUniqueOrThrow({ where: { id: spaceId } })).ownerId!, kind: 'PRODUCTS_CSV' },
    });
    await server()
      .get(`/api/v1/jobs/exports/${pending.id}/download`)
      .set('Authorization', auth())
      .expect(409);
    await prisma.exportJob.delete({ where: { id: pending.id } });
  });

  it('failedAsyncJob hace fallar los exports de forma reproducible', async () => {
    await server()
      .patch('/api/v1/spaces/me/scenarios')
      .set('Authorization', auth())
      .send({ failedAsyncJob: true })
      .expect(200);

    const failed = await createJob('PRODUCTS_CSV');
    expect(failed).toMatchObject({ status: 'FAILED' });
    expect(String(failed.error)).toContain('failedAsyncJob');
    await server()
      .get(`/api/v1/jobs/exports/${failed.id}/download`)
      .set('Authorization', auth())
      .expect(409);

    const notes = await server()
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', auth())
      .expect(200);
    expect(notes.body.data.map((n: { type: string }) => n.type)).toContain('JOB_FAILED');

    await server()
      .patch('/api/v1/spaces/me/scenarios')
      .set('Authorization', auth())
      .send({ failedAsyncJob: false })
      .expect(200);
    const recovered = await createJob('PRODUCTS_CSV');
    expect(recovered).toMatchObject({ status: 'COMPLETED' });
  });

  it('recupera trabajos huérfanos PENDING al arrancar la cola', async () => {
    const ownerId = (await prisma.space.findUniqueOrThrow({ where: { id: spaceId } })).ownerId!;
    const orphan = await prisma.exportJob.create({
      data: { spaceId, ownerId, kind: 'NOTES_CSV', status: 'PENDING' },
    });
    await app.get(JobsQueueService).recoverOrphans();
    const result = await prisma.exportJob.findUniqueOrThrow({ where: { id: orphan.id } });
    expect(result.status).toBe('COMPLETED');
  });
});
