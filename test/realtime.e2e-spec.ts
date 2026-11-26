import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupCommerceSpace,
  createTestApp,
  TEST_PASSWORD,
  uniqueEmail,
} from './utils';

function once<T = Record<string, unknown>>(socket: Socket, event: string, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout esperando ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitFor<T = Record<string, unknown>>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean,
  ms = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout esperando ${event} con condición`));
    }, ms);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

describe('Realtime / chat / replay (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;
  let ownerToken: string;
  let memberToken: string;
  let otherToken: string;
  let personalId: string;
  let teamId: string;
  let roomId: string;
  const sockets: Socket[] = [];
  const ownerEmail = uniqueEmail('ws-owner');
  const memberEmail = uniqueEmail('ws-member');
  const otherEmail = uniqueEmail('ws-other');

  const server = () => request(app.getHttpServer());
  const auth = (token: string) => `Bearer ${token}`;

  async function connect(token: string): Promise<Socket> {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token },
      forceNew: true,
      reconnection: false,
    });
    await once(socket, 'connection:ready');
    sockets.push(socket);
    return socket;
  }

  async function register(email: string, name: string): Promise<string> {
    const res = await server()
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, name })
      .expect(201);
    return res.body.data.tokens.accessToken as string;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    ownerToken = await register(ownerEmail, 'Owner WS');
    memberToken = await register(memberEmail, 'Member WS');
    otherToken = await register(otherEmail, 'Other WS');
    personalId = (await server().get('/api/v1/spaces/me').set('Authorization', auth(ownerToken)).expect(200)).body.data.id;

    const team = await server()
      .post('/api/v1/spaces/teams')
      .set('Authorization', auth(ownerToken))
      .send({ name: 'Equipo WS' })
      .expect(201);
    teamId = team.body.data.id;
    await server()
      .post(`/api/v1/spaces/${teamId}/members`)
      .set('Authorization', auth(ownerToken))
      .send({ email: memberEmail, role: 'EDITOR' })
      .expect(201);

    roomId = (
      await server()
        .post('/api/v1/chat/rooms')
        .set('Authorization', auth(ownerToken))
        .set('x-space-id', teamId)
        .send({ name: 'General' })
        .expect(201)
    ).body.data.id;
    // Evento previo para verificar replay tras reconexión.
    await server()
      .post('/api/v1/products')
      .set('Authorization', auth(ownerToken))
      .set('x-space-id', teamId)
      .send({ name: 'Producto WS', price: 500, stock: 2 })
      .expect(201);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (teamId) await cleanupCommerceSpace(prisma, teamId);
    if (personalId) await cleanupCommerceSpace(prisma, personalId);
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail, otherEmail] } } });
    await app.close();
  });

  it('rechaza conexiones sin JWT válido', async () => {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token: 'token-invalido' },
      forceNew: true,
      reconnection: false,
    });
    const error = await once<{ code: string }>(socket, 'ws:error');
    expect(error.code).toBe('AUTH_TOKEN_INVALID');
    socket.disconnect();
  });

  it('broadcast chat:message a los miembros de la sala con sequence', async () => {
    const owner = await connect(ownerToken);
    const member = await connect(memberToken);
    const ownerMessage = once<{ content: string; sequence: number; senderId: string }>(owner, 'chat:message');
    const memberMessage = once<{ content: string; sequence: number }>(member, 'chat:message');
    await owner.emitWithAck('chat:send', { roomId, content: 'hola equipo' });
    const first = await ownerMessage;
    const second = await memberMessage;
    expect(first).toMatchObject({ content: 'hola equipo', sequence: 1 });
    expect(second).toMatchObject({ content: 'hola equipo', sequence: 1 });

    const history = await server()
      .get(`/api/v1/chat/rooms/${roomId}/messages`)
      .set('Authorization', auth(memberToken))
      .set('x-space-id', teamId)
      .expect(200);
    expect(history.body.data).toHaveLength(1);

    const denied = once<{ code: string }>(owner, 'ws:error');
    owner.emit('chat:send', { roomId: '00000000-0000-4000-8000-000000000000', content: 'x' });
    expect((await denied).code).toBe('CHAT_ROOM_NOT_FOUND');
  });

  it('impide usar una sala del espacio personal de otro usuario', async () => {
    const owner = await connect(ownerToken);
    const ownRoom = (
      await server()
        .post('/api/v1/chat/rooms')
        .set('Authorization', auth(ownerToken))
        .send({ name: 'Sala privada' })
        .expect(201)
    ).body.data.id;
    const intruder = await connect(otherToken);
    const error = once<{ code: string }>(intruder, 'ws:error');
    intruder.emit('chat:send', { roomId: ownRoom, content: 'intruso' });
    expect((await error).code).toBe('SPACE_ACCESS_DENIED');
    owner.disconnect();
    intruder.disconnect();
  });

  it('emite resource:changed al crear productos y hace replay por lastEventId', async () => {
    const socket = await connect(ownerToken);
    const changed = once<{ type: string; action: string; resourceType: string }>(socket, 'resource:changed');
    await server()
      .post('/api/v1/products')
      .set('Authorization', auth(ownerToken))
      .set('x-space-id', teamId)
      .send({ name: 'Producto cambiado', price: 900, stock: 1 })
      .expect(201);
    const event = await changed;
    expect(event).toMatchObject({ type: 'PRODUCT', action: 'created', resourceType: 'PRODUCT' });

    const replay = await socket.emitWithAck('events:replay', { lastEventId: 0, spaceId: teamId, limit: 100 });
    expect(replay.events.length).toBeGreaterThanOrEqual(2);
    expect(replay.events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['PRODUCT', 'CHAT_MESSAGE']));
    expect(replay.lastEventId).toBeGreaterThan(0);
  });

  it('entrega notification:new y job:updated al propietario', async () => {
    const socket = await connect(ownerToken);
    const notification = once<{ type: string }>(socket, 'notification:new');
    const jobUpdated = waitFor<{ status: string; progress: number }>(
      socket,
      'job:updated',
      (payload) => payload.status === 'COMPLETED',
    );
    await server()
      .post('/api/v1/notes')
      .set('Authorization', auth(ownerToken))
      .send({ title: 'Nota realtime', content: 'exportar' })
      .expect(201);
    await server()
      .post('/api/v1/jobs/exports')
      .set('Authorization', auth(ownerToken))
      .send({ kind: 'NOTES_CSV' })
      .expect(201);
    expect((await notification).type).toBe('JOB_COMPLETED');
    expect(await jobUpdated).toMatchObject({ status: 'COMPLETED', progress: 100 });
  });
});
