import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Note, Prisma } from '@prisma/client';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { QueryNotesDto } from './dto/query-notes.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

/** Notas privadas: siempre filtradas por espacio Y propietario. */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async list(spaceId: string, ownerId: string, query: QueryNotesDto) {
    const { page, limit, skip, take } = getPageParams(query);
    const where: Prisma.NoteWhereInput = { spaceId, ownerId };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.tags) {
      const tags = query.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 0) where.tags = { hasSome: tags };
    }
    if (query.isFavorite !== undefined) where.isFavorite = query.isFavorite;
    if (query.isArchived !== undefined) where.isArchived = query.isArchived;

    const orderBy: Prisma.NoteOrderByWithRelationInput = {
      [query.sort ?? 'createdAt']: query.order ?? 'desc',
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.note.findMany({ where, orderBy, skip, take }),
      this.prisma.note.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(spaceId: string, ownerId: string, id: string): Promise<Note> {
    const note = await this.prisma.note.findFirst({ where: { id, spaceId, ownerId } });
    if (!note) {
      throw new NotFoundException({
        code: 'NOTE_NOT_FOUND',
        message: 'La nota no existe o no te pertenece.',
      });
    }
    return note;
  }

  async create(spaceId: string, ownerId: string, dto: CreateNoteDto): Promise<Note> {
    const note = await this.prisma.note.create({
      data: {
        spaceId,
        ownerId,
        title: dto.title,
        content: dto.content,
        tags: dto.tags ?? [],
        color: dto.color,
        isFavorite: dto.isFavorite ?? false,
        isArchived: dto.isArchived ?? false,
      },
    });
    await this.realtime.recordSafely(spaceId, 'NOTE', {
      action: 'created',
      resourceType: 'NOTE',
      resourceId: note.id,
      ownerId,
    });
    return note;
  }

  /** Actualización con control de concurrencia optimista (409 si cambió la versión). */
  async update(
    spaceId: string,
    ownerId: string,
    id: string,
    dto: UpdateNoteDto,
  ): Promise<Note> {
    const { version, ...patch } = dto;
    const result = await this.prisma.note.updateMany({
      where: { id, spaceId, ownerId, version },
      data: { ...patch, version: { increment: 1 } },
    });

    if (result.count === 0) {
      const existing = await this.prisma.note.findFirst({
        where: { id, spaceId, ownerId },
        select: { version: true },
      });
      if (!existing) {
        throw new NotFoundException({
          code: 'NOTE_NOT_FOUND',
          message: 'La nota no existe o no te pertenece.',
        });
      }
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'La nota cambió desde que la consultaste. Recárgala y reintenta.',
        fields: { version: ['La versión enviada no coincide con la actual.'] },
      });
    }

    const updated = await this.findOne(spaceId, ownerId, id);
    await this.realtime.recordSafely(spaceId, 'NOTE', {
      action: 'updated',
      resourceType: 'NOTE',
      resourceId: updated.id,
      ownerId,
      version: updated.version,
    });
    return updated;
  }

  async remove(spaceId: string, ownerId: string, id: string): Promise<void> {
    const result = await this.prisma.note.deleteMany({ where: { id, spaceId, ownerId } });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'NOTE_NOT_FOUND',
        message: 'La nota no existe o no te pertenece.',
      });
    }
    // La nota no tiene campo de archivos en Etapa 1/2; si en el futuro se
    // enlazan objetos con entityType=NOTE, se limpian aquí.
    await this.files.deleteByEntity('NOTE', id);
    await this.realtime.recordSafely(spaceId, 'NOTE', {
      action: 'deleted',
      resourceType: 'NOTE',
      resourceId: id,
      ownerId,
    });
  }
}
