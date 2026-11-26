import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { SpaceAccessService } from '../access/space-access.service';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ChatSendDto } from './dto/chat-send.dto';
import { ReplayEventDto } from './dto/replay-event.dto';
import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeEventsService } from './realtime-events.service';
import { ReplayEvent, roomName, WS_EVENTS } from './realtime.constants';

interface WsPayload {
  sub: string;
  email: string;
  spaceId: string;
}

function reject(client: Socket, code: string, message: string): void {
  client.emit(WS_EVENTS.ERROR, { code, message });
}

/**
 * Canal WebSocket. Autenticación con el JWT de acceso en `auth.token` o en la
 * cabecera `Authorization`. Las salas se resuelvan desde la BD (nunca desde
 * un `roomId` proporcionado por el cliente sin verificar pertenencia/rol).
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly emitter: RealtimeEmitter,
    private readonly events: RealtimeEventsService,
  ) {}

  afterInit(server: Server): void {
    this.emitter.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const authToken =
      (client.handshake.auth?.token as string | undefined) ??
      this.bearerFromHeader(client.handshake.headers.authorization);
    if (!authToken) {
      reject(client, 'AUTH_TOKEN_MISSING', 'Falta el token de acceso en auth.token.');
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<WsPayload>(authToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const user: AuthUser = { id: payload.sub, email: payload.email, spaceId: payload.spaceId };
      client.data.user = user;
      await client.join(roomName.user(user.id));

      const [spaces, rooms] = await Promise.all([
        this.prisma.space.findMany({
          where: {
            OR: [
              { ownerId: user.id },
              { memberships: { some: { userId: user.id } } },
            ],
          },
          select: { id: true },
        }),
        this.prisma.chatMember.findMany({
          where: { userId: user.id },
          select: { roomId: true },
        }),
      ]);
      for (const space of spaces) await client.join(roomName.space(space.id));
      for (const room of rooms) await client.join(roomName.chat(room.roomId));
      client.emit('connection:ready', { user, spaces: spaces.map((s) => s.id) });
    } catch (error: unknown) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      reject(
        client,
        expired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
        'No se pudo autenticar la conexión WebSocket.',
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WebSocket desconectado: ${client.id}`);
  }

  @SubscribeMessage(WS_EVENTS.CHAT_SEND)
  async onChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ChatSendDto,
  ): Promise<unknown> {
    const user = client.data.user as AuthUser | undefined;
    if (!user) return reject(client, 'AUTH_TOKEN_MISSING', 'Conexión no autenticada.');

    const dto = plainToInstance(ChatSendDto, body ?? {});
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: false })).length > 0) {
      return reject(client, 'VALIDATION_ERROR', 'roomId UUID y content (1-4000 caracteres) son obligatorios.');
    }

    const room = await this.prisma.chatRoom.findUnique({
      where: { id: dto.roomId },
      include: { space: true },
    });
    if (!room) return reject(client, 'CHAT_ROOM_NOT_FOUND', 'La sala no existe.');

    try {
      // El propietario del espacio personal es el único autorizado; en equipos
      // basta con ser miembro (incluso con rol LECTOR).
      await this.access.roleIn(room.space, user.id);
    } catch {
      return reject(client, 'SPACE_ACCESS_DENIED', 'No tienes acceso a la sala.');
    }
    const member = await this.prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
      select: { id: true },
    });
    if (!member) return reject(client, 'CHAT_MEMBER_REQUIRED', 'No eres miembro de esta sala.');

    const message = await this.appendMessage(room.id, user.id, dto.content.trim());
    const payload = {
      id: message.id,
      roomId: room.id,
      spaceId: room.spaceId,
      senderId: user.id,
      content: message.content,
      sequence: message.sequence,
      createdAt: message.createdAt.toISOString(),
    };
    this.emitter.toChatRoom(room.id, WS_EVENTS.CHAT_MESSAGE, payload);
    await this.events.recordSafely(room.spaceId, 'CHAT_MESSAGE', {
      roomId: room.id,
      messageId: message.id,
      senderId: user.id,
    });
    return payload;
  }

  @SubscribeMessage(WS_EVENTS.EVENTS_REPLAY)
  async onReplay(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ReplayEventDto,
  ): Promise<unknown> {
    const user = client.data.user as AuthUser | undefined;
    if (!user) return reject(client, 'AUTH_TOKEN_MISSING', 'Conexión no autenticada.');

    const dto = plainToInstance(ReplayEventDto, {
      lastEventId: body?.lastEventId ?? 0,
      spaceId: body?.spaceId,
      limit: body?.limit ?? 50,
    });
    if ((await validate(dto, { whitelist: true })).length > 0) {
      return reject(client, 'VALIDATION_ERROR', 'lastEventId debe ser entero >= 0 y limit 1-100.');
    }

    let spaceIds: string[];
    if (dto.spaceId) {
      try {
        const space = await this.access.resolveForUser(user, dto.spaceId);
        spaceIds = [space.id];
      } catch {
        return reject(client, 'SPACE_ACCESS_DENIED', 'No tienes acceso a ese espacio.');
      }
    } else {
      const spaces = await this.prisma.space.findMany({
        where: {
          OR: [
            { ownerId: user.id },
            { memberships: { some: { userId: user.id } } },
          ],
        },
        select: { id: true },
      });
      spaceIds = spaces.map((s) => s.id);
    }

    const rows = await this.prisma.realtimeEvent.findMany({
      where: { spaceId: { in: spaceIds }, id: { gt: dto.lastEventId } },
      orderBy: { id: 'asc' },
      take: dto.limit,
      select: { id: true, spaceId: true, type: true, payload: true, createdAt: true },
    });
    const events: ReplayEvent[] = rows.map((row) => ({
      id: row.id,
      spaceId: row.spaceId,
      type: row.type,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    }));
    const response = {
      events,
      lastEventId: events.length > 0 ? events[events.length - 1].id : dto.lastEventId,
      hasMore: events.length === dto.limit,
    };
    client.emit(WS_EVENTS.EVENTS_REPLAY, response);
    return response;
  }

  private async appendMessage(
    roomId: string,
    senderId: string,
    content: string,
  ): Promise<{ id: string; sequence: number; content: string; createdAt: Date }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const max = await this.prisma.chatMessage.aggregate({
        where: { roomId },
        _max: { sequence: true },
      });
      const sequence = (max._max.sequence ?? 0) + 1;
      try {
        return await this.prisma.chatMessage.create({
          data: { roomId, senderId, content, sequence },
          select: { id: true, sequence: true, content: true, createdAt: true },
        });
      } catch (error: unknown) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('No se pudo asignar un número de secuencia a la mensaje.');
  }

  private bearerFromHeader(header: string | undefined): string | undefined {
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
  }
}
