import { Inject, Injectable, Logger } from '@nestjs/common';
import { ExportKind, FileKind, NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { WS_EVENTS } from '../realtime/realtime.constants';
import { SimulatorService } from '../simulator/simulator.service';
import { STORAGE_PROVIDER, StorageProvider } from '../files/storage/storage-provider';
import { toCsv } from './csv.util';

interface ExportFilters {
  search?: string;
  categoryId?: string;
  isArchived?: boolean;
}

/**
 * Ejecuta una exportación. No conoce BullMQ: puede llamarse de forma inline
 * (tests/CI) o desde el worker. PostgreSQL es la fuente de verdad del estado.
 */
@Injectable()
export class ExportProcessorService {
  private readonly logger = new Logger(ExportProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly events: RealtimeEventsService,
    private readonly simulator: SimulatorService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async process(jobId: string): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === ExportStatusLike.COMPLETED) return;

    const claimed = await this.prisma.exportJob.updateMany({
      where: { id: jobId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'PROCESSING', progress: 10, error: null },
    });
    if (claimed.count === 0) return;

    this.emitJob(jobId, job.ownerId, 'PROCESSING', 10);
    try {
      // Escenario del simulador: fallo reproducible mientras esté activo.
      const scenario = await this.simulator.activeFor(job.spaceId);
      if (scenario?.failedAsyncJob) {
        throw new Error('Fallo simulado: failedAsyncJob está activo en este espacio.');
      }

      const { csv, fileName, rowCount } = await this.buildCsv(job.kind, job.spaceId, job.ownerId, job.filters as Prisma.JsonValue);
      const key = `spaces/${job.spaceId}/exports/${job.id}.csv`;
      await this.storage.put(key, Buffer.from(csv, 'utf8'), 'text/csv; charset=utf-8');

      const file = await this.prisma.fileObject.create({
        data: {
          spaceId: job.spaceId,
          ownerId: job.ownerId,
          key,
          originalName: fileName,
          mimeType: 'text/csv',
          size: Buffer.byteLength(csv, 'utf8'),
          kind: FileKind.DOCUMENT,
          entityType: 'EXPORT_JOB',
          entityId: job.id,
        },
      });
      const updated = await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          fileObjectId: file.id,
          finishedAt: new Date(),
          error: null,
        },
      });
      this.emitJob(job.id, job.ownerId, updated.status, updated.progress, file.id);
      await this.events.recordSafely(job.spaceId, 'EXPORT_JOB', {
        jobId: job.id,
        kind: job.kind,
        status: updated.status,
        rowCount,
      });
      await this.notifySafely(job, NotificationType.JOB_COMPLETED, 'Exportación completada', `Tu exportación ${job.kind} está lista para descargar.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const updated = await this.prisma.exportJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', progress: 0, error: message.slice(0, 1000), finishedAt: new Date() },
      });
      this.emitJob(job.id, job.ownerId, updated.status, 0, undefined, message.slice(0, 1000));
      await this.events.recordSafely(job.spaceId, 'EXPORT_JOB', {
        jobId: job.id,
        kind: job.kind,
        status: 'FAILED',
        error: message.slice(0, 1000),
      });
      await this.notifySafely(job, NotificationType.JOB_FAILED, 'Exportación fallida', message.slice(0, 500));
      this.logger.warn(JSON.stringify({ event: 'export_job_failed', jobId: job.id, error: message }));
    }
  }

  private emitJob(
    jobId: string,
    ownerId: string,
    status: string,
    progress: number,
    fileObjectId?: string,
    error?: string,
  ): void {
    this.emitter.toUser(
      ownerId,
      WS_EVENTS.JOB_UPDATED,
      { id: jobId, status, progress, fileObjectId: fileObjectId ?? null, error: error ?? null },
    );
  }

  private async notifySafely(
    job: { id: string; spaceId: string; ownerId: string; kind: ExportKind },
    type: NotificationType,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notifications.create({
        spaceId: job.spaceId,
        userId: job.ownerId,
        title,
        body,
        type,
        resourceType: 'EXPORT_JOB',
        resourceId: job.id,
      });
    } catch (error: unknown) {
      this.logger.warn(JSON.stringify({ event: 'job_notification_failed', jobId: job.id, error: String(error) }));
    }
  }

  private async buildCsv(
    kind: ExportKind,
    spaceId: string,
    ownerId: string,
    rawFilters: Prisma.JsonValue,
  ): Promise<{ csv: string; fileName: string; rowCount: number }> {
    const filters: ExportFilters =
      rawFilters && typeof rawFilters === 'object' && !Array.isArray(rawFilters)
        ? (rawFilters as ExportFilters)
        : {};

    if (kind === ExportKind.PRODUCTS_CSV) {
      const where: Prisma.ProductWhereInput = { spaceId };
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
      if (filters.categoryId) where.categoryId = filters.categoryId;
      const rows = await this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, price: true, currency: true, stock: true, status: true, createdAt: true },
      });
      return {
        csv: toCsv(
          ['id', 'name', 'price', 'currency', 'stock', 'status', 'createdAt'],
          rows.map((r) => [r.id, r.name, r.price, r.currency, r.stock, r.status, r.createdAt]),
        ),
        fileName: `products-${spaceId}.csv`,
        rowCount: rows.length,
      };
    }

    const where: Prisma.NoteWhereInput = { spaceId, ownerId };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.isArchived !== undefined) where.isArchived = filters.isArchived;
    const rows = await this.prisma.note.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, content: true, tags: true, isFavorite: true, isArchived: true, createdAt: true },
    });
    return {
      csv: toCsv(
        ['id', 'title', 'content', 'tags', 'isFavorite', 'isArchived', 'createdAt'],
        rows.map((r) => [r.id, r.title, r.content, r.tags.join('|'), r.isFavorite, r.isArchived, r.createdAt]),
      ),
      fileName: `notes-${spaceId}.csv`,
      rowCount: rows.length,
    };
  }
}

// Evita depender del enum generado en tiempo de compilación para un valor simple.
const ExportStatusLike = { COMPLETED: 'COMPLETED' } as const;
