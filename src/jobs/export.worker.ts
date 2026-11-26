import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { STORAGE_PROVIDER, StorageProvider } from '../files/storage/storage-provider';
import { PrismaService } from '../prisma/prisma.service';
import { ExportProcessorService } from './export.processor';
import { EXPORT_QUEUE_NAME } from './jobs.queue';

/** Consumidor BullMQ. Se activa SOLO en el contenedor `worker`. */
@Injectable()
export class ExportWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportWorkerService.name);
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly processor: ExportProcessorService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    const mode = this.config.get<string>('JOBS_QUEUE_MODE') ?? 'redis';
    const workerMode = this.config.get<boolean>('WORKER_MODE') === true;
    if (mode !== 'redis' || !workerMode) return;

    const connection = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker(
      EXPORT_QUEUE_NAME,
      async (job) => {
        if (job.name === 'export') await this.processor.process(String(job.data.jobId));
      },
      { connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(JSON.stringify({ event: 'bullmq_job_failed', jobId: job?.id, error: String(error) }));
    });
    this.logger.log(`Worker BullMQ escuchando ${EXPORT_QUEUE_NAME}`);
    await this.purgeExpired();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    this.worker = null;
  }

  /** JOBS_RETENTION_HOURS: limpia exportaciones finalizadas y sus objetos. */
  private async purgeExpired(): Promise<void> {
    const hours = this.config.getOrThrow<number>('JOBS_RETENTION_HOURS');
    const cutoff = new Date(Date.now() - hours * 3600_000);
    const expired = await this.prisma.exportJob.findMany({
      where: { finishedAt: { lt: cutoff }, fileObjectId: { not: null } },
      select: { fileObjectId: true },
    });
    for (const job of expired) {
      if (!job.fileObjectId) continue;
      const file = await this.prisma.fileObject.findUnique({
        where: { id: job.fileObjectId },
        select: { key: true },
      });
      if (file) await this.storage.delete(file.key).catch(() => undefined);
      await this.prisma.fileObject.deleteMany({ where: { id: job.fileObjectId } });
    }
    await this.prisma.exportJob.deleteMany({ where: { finishedAt: { lt: cutoff } } });
  }
}
