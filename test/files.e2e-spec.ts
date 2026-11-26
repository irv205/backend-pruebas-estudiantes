import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.configure';
import { AppModule } from '../src/app.module';
import { STORAGE_PROVIDER } from '../src/files/storage/storage-provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureDemoSpace } from '../src/database/demo-data';
import { TEST_PASSWORD, uniqueEmail } from './utils';

/** Stub del cliente S3: las pruebas no dependen de MinIO ni de la red. */
function createStorageStub() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    put: jest.fn(async (key: string, body: Buffer) => {
      objects.set(key, body);
    }),
    get: jest.fn(async (key: string) => {
      const body = objects.get(key);
      if (!body) throw new Error('ENOENT');
      return body;
    }),
    delete: jest.fn(async (key: string) => {
      objects.delete(key);
    }),
    presignedUrl: jest.fn(async () => null),
  };
}

describe('Files with mocked S3 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = uniqueEmail('files');
  const storage = createStorageStub();
  let token: string;
  let fileId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_PROVIDER)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await ensureDemoSpace(prisma);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Archivos E2E' })
      .expect(201);
    token = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  it('sube, descarga y elimina un archivo con prefijo por espacio', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', auth())
      .attach('file', Buffer.from('contenido de prueba'), {
        filename: 'prueba.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    fileId = uploaded.body.data.id;
    expect(uploaded.body.data.url).toContain(`/api/v1/files/${fileId}/download`);
    expect([...storage.objects.keys()].some((key) => key.startsWith('spaces/'))).toBe(true);

    const downloaded = await request(app.getHttpServer())
      .get(`/api/v1/files/${fileId}/download`)
      .set('Authorization', auth())
      .expect(200);
    expect(downloaded.text).toBe('contenido de prueba');

    await request(app.getHttpServer())
      .delete(`/api/v1/files/${fileId}`)
      .set('Authorization', auth())
      .expect(204);
    expect(storage.objects.size).toBe(0);
  });

  it('valida tipo MIME y tamaño', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', auth())
      .attach('file', Buffer.from('malicioso'), {
        filename: 'mal.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400)
      .expect((res) => expect(res.body.error.code).toBe('INVALID_FILE_TYPE'));

    await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', auth())
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 'a'), {
        filename: 'grande.txt',
        contentType: 'text/plain',
      })
      .expect(400)
      .expect((res) => expect(res.body.error.code).toBe('FILE_TOO_LARGE'));
  });

  it('avatar: reemplaza el objeto anterior sin dejar huérfanos', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .set('Authorization', auth())
      .attach('avatar', Buffer.from('avatar-1'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(first.body.data.avatarUrl).toContain('/api/v1/files/');

    const avatarsAfterFirst = [...storage.objects.keys()].filter((key) => key.includes('/avatar/'));
    expect(avatarsAfterFirst).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .set('Authorization', auth())
      .attach('avatar', Buffer.from('avatar-2'), {
        filename: 'avatar2.png',
        contentType: 'image/png',
      })
      .expect(201);

    const avatarsAfterSecond = [...storage.objects.keys()].filter((key) => key.includes('/avatar/'));
    expect(avatarsAfterSecond).toHaveLength(1);
    expect([...storage.objects.values()][0].toString()).toBe('avatar-2');
  });
});
