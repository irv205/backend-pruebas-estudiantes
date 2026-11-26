import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ExportProcessorService } from './export.processor';

export const EXPORT_QUEUE_NAME = 'exports';

/**
 * Productor de trabajos. `inline` ejecuta el procesador en el mismo proceso
 * (CI/e2e, sin Redis); `redis` publica en BullMQ para el servicio `worker`.
 */
@Injectable()
export class JobsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsQueueService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly processor: ExportProcessorService,
  ) {}

  async onModuleInit(): Promise<void> {
    const mode = this.config.get<string>('JOBS_QUEUE_MODE') ?? 'redis';
    const workerMode = this.config.get<boolean>('WORKER_MODE') === true;
    // Solo recupera el proceso que va a ejecutar los trabajos: la app en modo
    // inline o el worker en modo redis. Nunca ambos a la vez.
    if (mode === 'inline' || workerMode) await this.recoverOrphans();
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
    this.queue = null;
  }

  async enqueue(jobId: string): Promise<void> {
    const mode = this.config.get<string>('JOBS_QUEUE_MODE') ?? 'redis';
    if (mode === 'inline') {
      await this.processor.process(jobId);
      return;
    }
    const queue = this.getQueue();
    await queue.add(
      'export',
      { jobId },
      { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
    );
  }

  /** Reencola trabajos PENDING/PROCESSING huérfanos tras un reinicio. */
  async recoverOrphans(): Promise<void> {
    const orphaned = await this.prisma.exportJob.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
    });
    for (const job of orphaned) {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: { status: 'PENDING', progress: 0, error: null },
      });
      try {
        await this.enqueue(job.id);
      } catch (error: unknown) {
        this.logger.warn(JSON.stringify({ event: 'job_recovery_failed', jobId: job.id, error: String(error) }));
      }
    }
  }

  private getQueue(): Queue {
    if (!this.queue) {
      const url = this.config.getOrThrow<string>('REDIS_URL');
      const connection = new Redis(url, { maxRetriesPerRequest: null });
      this.queue = new Queue(EXPORT_QUEUE_NAME, { connection });
    }
    return this.queue;
  }
}
