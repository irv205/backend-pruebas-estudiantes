import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification, NotificationType, Prisma, Space } from '@prisma/client';
import { SpaceAccessService } from '../access/space-access.service';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { WS_EVENTS } from '../realtime/realtime.constants';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

export interface CreateNotificationInput {
  spaceId: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  resourceType?: string;
  resourceId?: string;
}

/** Notificaciones por usuario y espacio; siempre se verifican ambos. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: {
        spaceId: input.spaceId,
        userId: input.userId,
        title: input.title,
        body: input.body,
        type: input.type,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
      },
    });
    this.emitter.toUser(input.userId, WS_EVENTS.NOTIFICATION_NEW, notification);
    return notification;
  }

  async list(user: AuthUser, space: Space, query: QueryNotificationsDto) {
    const { page, limit, skip, take } = getPageParams(query);
    const where: Prisma.NotificationWhereInput = {
      spaceId: space.id,
      userId: user.id,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(user: AuthUser, space: Space, id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, spaceId: space.id, userId: user.id },
    });
    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'La notificación no existe en este espacio.',
      });
    }
    return notification;
  }

  async unreadCount(user: AuthUser, space: Space): Promise<{ count: number }> {
    return {
      count: await this.prisma.notification.count({
        where: { spaceId: space.id, userId: user.id, isRead: false },
      }),
    };
  }

  async markRead(user: AuthUser, space: Space, id: string): Promise<Notification> {
    await this.findOne(user, space, id);
    await this.prisma.notification.updateMany({
      where: { id, spaceId: space.id, userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return this.findOne(user, space, id);
  }

  async markAllRead(user: AuthUser, space: Space): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { spaceId: space.id, userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }
}
