import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from './realtime.emitter';
import { ResourceChangedPayload, WS_EVENTS } from './realtime.constants';

/**
 * Persistencia + difusión de eventos. La fila en `RealtimeEvent` es la que
 * permite el replay tras reconexión; WebSocket es solo el transporte.
 */
@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async record(
    spaceId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<ResourceChangedPayload> {
    const event = await this.prisma.realtimeEvent.create({
      data: { spaceId, type, payload: payload as Prisma.InputJsonValue },
      select: { id: true, spaceId: true, type: true, payload: true, createdAt: true },
    });
    const outgoing: ResourceChangedPayload = {
      id: event.id,
      spaceId: event.spaceId,
      type: event.type,
      action: (payload.action as ResourceChangedPayload['action']) ?? 'updated',
      resourceType: (payload.resourceType as string) ?? type,
      resourceId: (payload.resourceId as string | null | undefined) ?? null,
      createdAt: event.createdAt.toISOString(),
    };
    this.emitter.toSpace(spaceId, WS_EVENTS.RESOURCE_CHANGED, outgoing);
    return outgoing;
  }

  /** Difusión best-effort: un fallo del canal nunca rompe la operación HTTP. */
  async recordSafely(
    spaceId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.record(spaceId, type, payload);
    } catch (error: unknown) {
      this.logger.warn(JSON.stringify({ event: 'realtime_event_failed', spaceId, type, error: String(error) }));
    }
  }
}
