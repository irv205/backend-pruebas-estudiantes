import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExportJob, FileObject, MembershipRole, Prisma, Space } from '@prisma/client';
import { SpaceAccessService } from '../access/space-access.service';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { AuthUser } from '../common/types/auth-user';
import { STORAGE_PROVIDER, StorageProvider } from '../files/storage/storage-provider';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { WS_EVENTS } from '../realtime/realtime.constants';
import { CreateExportDto } from './dto/create-export.dto';
import { QueryExportsDto } from './dto/query-exports.dto';
import { JobsQueueService } from './jobs.queue';

/** Consultas y descargas de exportaciones; siempre filtradas por espacio. */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly queue: JobsQueueService,
    private readonly emitter: RealtimeEmitter,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async create(user: AuthUser, space: Space, dto: CreateExportDto): Promise<ExportJob> {
    this.access.assertWritable(space);
    const job = await this.prisma.exportJob.create({
      data: {
        spaceId: space.id,
        ownerId: user.id,
        kind: dto.kind,
        status: 'PENDING',
        progress: 0,
        filters: (dto.filters ?? {}) as Prisma.InputJsonValue,
      },
    });
    this.emit(job.id, user.id, job.status, job.progress);
    await this.queue.enqueue(job.id);
    return (await this.prisma.exportJob.findUnique({ where: { id: job.id } })) ?? job;
  }

  async list(user: AuthUser, space: Space, role: MembershipRole, query: QueryExportsDto) {
    const { page, limit, skip, take } = getPageParams(query);
    const where: Prisma.ExportJobWhereInput = {
      spaceId: space.id,
      ...(role === MembershipRole.ADMINISTRADOR ? {} : { ownerId: user.id }),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.exportJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.exportJob.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async detail(
    user: AuthUser,
    space: Space,
    role: MembershipRole,
    id: string,
  ): Promise<ExportJob> {
    return this.findJob(space.id, user.id, role, id);
  }

  async download(
    user: AuthUser,
    space: Space,
    role: MembershipRole,
    id: string,
  ): Promise<{ file: FileObject; body: Buffer }> {
    const job = await this.findJob(space.id, user.id, role, id);
    if (job.status !== 'COMPLETED' || !job.fileObjectId) {
      throw new ConflictException({
        code: 'EXPORT_NOT_READY',
        message: 'La exportación aún no está disponible. Espera a que termine con éxito.',
        fields: { status: [job.status] },
      });
    }
    const file = await this.prisma.fileObject.findFirst({
      where: { id: job.fileObjectId, spaceId: space.id },
    });
    if (!file) {
      throw new ConflictException({
        code: 'EXPORT_FILE_MISSING',
        message: 'El archivo de la exportación ya no existe.',
      });
    }
    const body = await this.storage.get(file.key).catch(() => {
      throw new ConflictException({
        code: 'EXPORT_FILE_MISSING',
        message: 'El objeto de la exportación no está disponible.',
      });
    });
    return { file, body };
  }

  private async findJob(
    spaceId: string,
    userId: string,
    role: MembershipRole,
    id: string,
  ): Promise<ExportJob> {
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id,
        spaceId,
        ...(role === MembershipRole.ADMINISTRADOR ? {} : { ownerId: userId }),
      },
    });
    if (!job) {
      throw new NotFoundException({
        code: 'EXPORT_JOB_NOT_FOUND',
        message: 'El trabajo no existe en este espacio.',
      });
    }
    return job;
  }

  private emit(id: string, ownerId: string, status: string, progress: number): void {
    this.emitter.toUser(ownerId, WS_EVENTS.JOB_UPDATED, { id, status, progress });
  }
}
