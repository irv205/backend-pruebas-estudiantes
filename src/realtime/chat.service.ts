import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Space } from '@prisma/client';
import { SpaceAccessService } from '../access/space-access.service';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

export interface ChatRoomSummary {
  id: string;
  spaceId: string;
  name: string;
  memberCount: number;
  createdAt: Date;
}

/** Salas por espacio: la membresía se deriva de SpaceMembership del espacio. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
  ) {}

  async create(user: AuthUser, space: Space, dto: CreateRoomDto): Promise<ChatRoomSummary> {
    this.access.assertWritable(space);
    const memberships = await this.prisma.spaceMembership.findMany({
      where: { spaceId: space.id },
      select: { userId: true },
    });
    const allowed = new Set(memberships.map((m) => m.userId));
    if (!allowed.has(user.id)) allowed.add(user.id);
    const requested = dto.memberIds ?? [...allowed];
    const memberIds = [...new Set(requested)];
    const unknown = memberIds.filter((id) => !allowed.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_ROOM_MEMBERS',
        message: 'Todos los miembros de la sala deben pertenecer al espacio.',
        fields: { memberIds: unknown },
      });
    }
    const room = await this.prisma.chatRoom.create({
      data: {
        spaceId: space.id,
        name: dto.name.trim(),
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      select: { id: true, spaceId: true, name: true, createdAt: true },
    });
    return { ...room, memberCount: memberIds.length };
  }

  async list(user: AuthUser, space: Space): Promise<ChatRoomSummary[]> {
    const role = await this.access.roleIn(space, user.id);
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        spaceId: space.id,
        ...(role === 'ADMINISTRADOR' ? {} : { members: { some: { userId: user.id } } }),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        spaceId: true,
        name: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    });
    return rooms.map((room) => ({
      id: room.id,
      spaceId: room.spaceId,
      name: room.name,
      createdAt: room.createdAt,
      memberCount: room._count.members,
    }));
  }

  async messages(user: AuthUser, space: Space, roomId: string, query: { page?: number; limit?: number }) {
    const room = await this.findRoom(space.id, roomId);
    await this.assertMember(room.id, user.id, space);
    const { page, limit, skip, take } = getPageParams(query);
    const where = { roomId: room.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.chatMessage.findMany({ where, orderBy: { sequence: 'asc' }, skip, take }),
      this.prisma.chatMessage.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  private async findRoom(spaceId: string, roomId: string) {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id: roomId, spaceId },
      select: { id: true, spaceId: true },
    });
    if (!room) {
      throw new NotFoundException({
        code: 'CHAT_ROOM_NOT_FOUND',
        message: 'La sala no existe en este espacio.',
      });
    }
    return room;
  }

  private async assertMember(roomId: string, userId: string, space: Space): Promise<void> {
    const role = await this.access.roleIn(space, userId);
    if (role === 'ADMINISTRADOR') return;
    const member = await this.prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'CHAT_ROOM_NOT_FOUND',
        message: 'La sala no existe o no te pertenece.',
      });
    }
  }
}
