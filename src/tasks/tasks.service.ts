import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Task, TaskStatus } from '@prisma/client';
import { getPageParams, paginate } from '../common/pagination/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateTaskDto, CreateSubtaskDto } from './dto/create-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { UpdateSubtaskDto } from './dto/subtask.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

/** Transiciones permitidas: se pueden reabrir tareas y cancelarlas, pero no
 * saltar de TODO directamente a DONE. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'DONE', 'CANCELLED'],
  DONE: ['IN_PROGRESS'],
  CANCELLED: ['TODO'],
};

const includeSubtasks = { subtasks: { orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  async list(spaceId: string, ownerId: string | null, query: QueryTasksDto) {
    const { page, limit, skip, take } = getPageParams(query);
    const where: Prisma.TaskWhereInput = { spaceId };
    if (query.status?.length) where.status = { in: query.status };
    if (query.priority?.length) where.priority = { in: query.priority };
    if (query.mine !== undefined) where.ownerId = query.mine ? ownerId : { not: ownerId };
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.dueBefore || query.dueAfter) {
      where.dueAt = {
        ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
        ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
      };
    }
    const orderBy: Prisma.TaskOrderByWithRelationInput = {
      [query.sort ?? 'createdAt']: query.order ?? 'desc',
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where, orderBy, skip, take, include: includeSubtasks }),
      this.prisma.task.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(spaceId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, spaceId },
      include: includeSubtasks,
    });
    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: 'La tarea no existe en este espacio.',
      });
    }
    return task;
  }

  /** El controlador valida el espacio/rol antes de llamar a este método. */
  async create(spaceId: string, ownerId: string | null, dto: CreateTaskDto): Promise<Task> {
    const task = await this.prisma.task.create({
      data: {
        spaceId,
        ownerId,
        title: dto.title.trim(),
        description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        status: dto.status ?? 'TODO',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        subtasks: {
          create: (dto.subtasks ?? []).map((subtask: CreateSubtaskDto) => ({ title: subtask.title })),
        },
      },
      include: includeSubtasks,
    });
    await this.realtime.recordSafely(spaceId, 'TASK', {
      action: 'created',
      resourceType: 'TASK',
      resourceId: task.id,
    });
    return task;
  }

  /** Actualización optimista con transiciones de estado validadas. */
  async update(spaceId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    const current = await this.findOne(spaceId, id);
    if (dto.status && dto.status !== current.status) {
      if (!TRANSITIONS[current.status].includes(dto.status)) {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `No se puede pasar de ${current.status} a ${dto.status}.`,
          fields: { status: [`Transiciones permitidas: ${TRANSITIONS[current.status].join(', ')}.`] },
        });
      }
    }

    const { version, dueAt, ...patch } = dto;
    const result = await this.prisma.task.updateMany({
      where: { id, spaceId, version },
      data: {
        ...patch,
        ...(dueAt === undefined ? {} : { dueAt: dueAt === null ? null : new Date(dueAt) }),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'La tarea cambió desde que la consultaste. Recárgala y reintenta.',
        fields: { version: ['La versión enviada no coincide con la actual.'] },
      });
    }
    const updated = await this.findOne(spaceId, id);
    await this.realtime.recordSafely(spaceId, 'TASK', {
      action: 'updated',
      resourceType: 'TASK',
      resourceId: updated.id,
      status: updated.status,
      version: updated.version,
    });
    return updated;
  }

  async remove(spaceId: string, id: string): Promise<void> {
    const result = await this.prisma.task.deleteMany({ where: { id, spaceId } });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: 'La tarea no existe en este espacio.',
      });
    }
    await this.realtime.recordSafely(spaceId, 'TASK', {
      action: 'deleted',
      resourceType: 'TASK',
      resourceId: id,
    });
  }

  async addSubtask(spaceId: string, taskId: string, dto: CreateSubtaskDto): Promise<Task> {
    await this.findOne(spaceId, taskId);
    await this.prisma.subtask.create({ data: { taskId, title: dto.title } });
    return this.findOne(spaceId, taskId);
  }

  async updateSubtask(
    spaceId: string,
    taskId: string,
    subtaskId: string,
    dto: UpdateSubtaskDto,
  ): Promise<Task> {
    await this.findOne(spaceId, taskId);
    const result = await this.prisma.subtask.updateMany({ where: { id: subtaskId, taskId }, data: dto });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'SUBTASK_NOT_FOUND',
        message: 'La subtarea no existe en esa tarea.',
      });
    }
    return this.findOne(spaceId, taskId);
  }

  async removeSubtask(spaceId: string, taskId: string, subtaskId: string): Promise<Task> {
    await this.findOne(spaceId, taskId);
    const result = await this.prisma.subtask.deleteMany({ where: { id: subtaskId, taskId } });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'SUBTASK_NOT_FOUND',
        message: 'La subtarea no existe en esa tarea.',
      });
    }
    return this.findOne(spaceId, taskId);
  }
}
