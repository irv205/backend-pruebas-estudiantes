import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileKind, FileObject, Space } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { SpaceAccessService } from '../access/space-access.service';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, StorageProvider } from './storage/storage-provider';

export interface FileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  url: string;
  downloadUrl: string;
  createdAt: Date;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly access: SpaceAccessService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Subida validada; el objeto siempre lleva el prefijo del espacio. */
  async upload(
    user: AuthUser,
    space: Space,
    file: Express.Multer.File,
    kind: FileKind = FileKind.OTHER,
    entityType?: string,
    entityId?: string,
  ): Promise<FileResponse> {
    this.access.assertWritable(space);
    this.validate(file);
    await this.assertQuota(space.id, file.size);

    const extension = extname(file.originalname)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 10);
    const key = `spaces/${space.id}/${kind.toLowerCase()}/${randomUUID()}${extension}`;

    await this.storage.put(key, file.buffer, file.mimetype);
    try {
      const record = await this.prisma.fileObject.create({
        data: {
          spaceId: space.id,
          ownerId: user.id,
          key,
          originalName: file.originalname.slice(0, 255),
          mimeType: file.mimetype,
          size: file.size,
          kind,
          entityType: entityType ?? null,
          entityId: entityId ?? null,
        },
      });
      return this.toResponse(record);
    } catch (err) {
      // Si falla la fila, no se deja un objeto huérfano.
      await this.storage.delete(key).catch(() => undefined);
      throw err;
    }
  }

  async list(spaceId: string, query: { page?: number; limit?: number }) {
    const { page, limit, skip, take } = getPageParams(query);
    const where = { spaceId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fileObject.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.fileObject.count({ where }),
    ]);
    return {
      data: await Promise.all(items.map((item) => this.toResponse(item))),
      meta: paginate([], total, page, limit).meta,
    };
  }

  async findOne(spaceId: string, id: string): Promise<FileObject> {
    const file = await this.prisma.fileObject.findFirst({ where: { id, spaceId } });
    if (!file) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'El archivo no existe en este espacio.',
      });
    }
    return file;
  }

  async metadata(user: AuthUser, spaceIdOrSlug: string | undefined, id: string) {
    const { space } = await this.access.require(user, 'read', spaceIdOrSlug);
    return this.toResponse(await this.findOne(space.id, id));
  }

  async listFor(user: AuthUser, spaceIdOrSlug: string | undefined, query: { page?: number; limit?: number }) {
    const { space } = await this.access.require(user, 'read', spaceIdOrSlug);
    return this.list(space.id, query);
  }

  /** Descarga autorizada: el objeto nunca se expone sin verificar espacio y rol. */
  async download(user: AuthUser, spaceIdOrSlug: string | undefined, id: string) {
    const { space } = await this.access.require(user, 'read', spaceIdOrSlug);
    const file = await this.findOne(space.id, id);
    const body = await this.storage.get(file.key).catch(() => {
      throw new NotFoundException({
        code: 'FILE_OBJECT_MISSING',
        message: 'El objeto ya no está en el almacenamiento; requiere reconciliación.',
      });
    });
    return { file, body };
  }

  async remove(user: AuthUser, spaceIdOrSlug: string | undefined, id: string): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceIdOrSlug);
    const file = await this.findOne(space.id, id);
    if (file.kind === FileKind.AVATAR && file.entityType === 'USER' && file.entityId) {
      await this.prisma.user.updateMany({
        where: { id: file.entityId, avatarUrl: `/api/v1/files/${file.id}/download` },
        data: { avatarUrl: null },
      });
    }
    await this.deleteObjects([file]);
    await this.prisma.fileObject.deleteMany({ where: { id: file.id, spaceId: space.id } });
  }

  // ── Limpieza coordinada (best-effort; ver README) ─────────────────────────

  async deleteManyForSpace(spaceId: string): Promise<number> {
    const files = await this.prisma.fileObject.findMany({ where: { spaceId }, select: { key: true } });
    await this.deleteObjects(files);
    const result = await this.prisma.fileObject.deleteMany({ where: { spaceId } });
    return result.count;
  }

  async deleteByEntity(entityType: string, entityId: string): Promise<number> {
    const files = await this.prisma.fileObject.findMany({
      where: { entityType, entityId },
      select: { key: true },
    });
    await this.deleteObjects(files);
    const result = await this.prisma.fileObject.deleteMany({ where: { entityType, entityId } });
    return result.count;
  }

  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const files = await this.prisma.fileObject.findMany({
      where: { id: { in: ids } },
      select: { key: true },
    });
    await this.deleteObjects(files);
    const result = await this.prisma.fileObject.deleteMany({ where: { id: { in: ids } } });
    return result.count;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const files = await this.prisma.fileObject.findMany({
      where: { ownerId: userId },
      select: { key: true },
    });
    await this.deleteObjects(files);
    const result = await this.prisma.fileObject.deleteMany({ where: { ownerId: userId } });
    return result.count;
  }

  private async deleteObjects(files: Array<{ key: string }>): Promise<void> {
    await Promise.all(
      files.map((file) =>
        this.storage.delete(file.key).catch((err: unknown) => {
          // Se deja constancia para reconciliación; no se filtran credenciales.
          this.logger.warn(JSON.stringify({ event: 'file_cleanup_pending', key: file.key, error: String(err) }));
        }),
      ),
    );
  }

  private validate(file: Express.Multer.File): void {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException({
        code: 'INVALID_FILE',
        message: 'El archivo está vacío.',
      });
    }
    const max = this.config.getOrThrow<number>('FILE_MAX_SIZE_BYTES');
    if (file.size > max) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `El archivo supera el límite de ${max} bytes.`,
        fields: { file: [`Tamaño máximo: ${max} bytes.`] },
      });
    }
    const allowed = (this.config.get<string>('FILE_ALLOWED_MIME_TYPES') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: `Tipo MIME no permitido: ${file.mimetype}.`,
        fields: { file: [`Permitidos: ${allowed.join(', ')}.`] },
      });
    }
  }

  private async assertQuota(spaceId: string, incomingBytes: number): Promise<void> {
    const quotaBytes = this.config.getOrThrow<number>('SPACE_FILE_QUOTA_BYTES');
    const quotaCount = this.config.getOrThrow<number>('SPACE_FILE_QUOTA_COUNT');
    const [agg] = await this.prisma.$transaction([
      this.prisma.fileObject.aggregate({
        where: { spaceId },
        _sum: { size: true },
        _count: { _all: true },
      }),
    ]);
    if ((agg._sum.size ?? 0) + incomingBytes > quotaBytes || agg._count._all >= quotaCount) {
      throw new HttpException(
        {
          code: 'FILE_QUOTA_EXCEEDED',
          message: `El espacio alcanzó su cuota de archivos (${quotaBytes} bytes / ${quotaCount} objetos).`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async toResponse(file: FileObject): Promise<FileResponse> {
    const downloadUrl = `/api/v1/files/${file.id}/download`;
    let url = downloadUrl;
    if (this.config.get<boolean>('S3_PRESIGN')) {
      const presigned = await this.storage.presignedUrl?.(
        file.key,
        this.config.getOrThrow<number>('S3_PRESIGN_TTL_SECONDS'),
      );
      if (presigned) url = presigned;
    }
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      kind: file.kind,
      url,
      downloadUrl,
      createdAt: file.createdAt,
    };
  }
}
