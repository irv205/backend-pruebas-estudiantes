import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole, Space, SpaceType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { SpaceAccessService } from '../access/space-access.service';
import { isUuid } from '../common/utils/uuid.util';
import { DEMO_SPACE_SLUG, ensureDemoSpace } from '../database/demo-data';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto, UpdateMemberDto } from './dto/member.dto';

@Injectable()
export class SpacesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SpacesService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly files: FilesService,
    private readonly access: SpaceAccessService,
    private readonly realtime: RealtimeEventsService,
  ) {}

  onModuleInit(): void {
    // Limpieza perezosa + periódica de sandboxes vencidos (TTL).
    void this.sweepExpiredSandboxes();
    this.sweepTimer = setInterval(() => void this.sweepExpiredSandboxes(), 3600_000);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ── Resolución de espacios ────────────────────────────────────────────────

  /** Devuelve un espacio por id o lanza 404. */
  async getSpace(spaceId: string): Promise<Space> {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException({
        code: 'SPACE_NOT_FOUND',
        message: 'El espacio indicado no existe.',
      });
    }
    return space;
  }

  /** Espacio demo público (solo lectura). Debe existir tras `prisma:seed`. */
  async getDemoSpace(): Promise<Space> {
    const slug = this.config.get<string>('DEMO_SPACE_SLUG') ?? DEMO_SPACE_SLUG;
    const space = await this.prisma.space.findUnique({ where: { slug } });
    if (!space) {
      throw new ServiceUnavailableException({
        code: 'DEMO_NOT_INITIALIZED',
        message: 'La demo pública no está inicializada. Ejecuta `npm run prisma:seed`.',
      });
    }
    return space;
  }

  /**
   * Resuelve el espacio de las rutas públicas:
   * - sin cabecera `x-space-id` → demo pública (solo lectura),
   * - con cabecera → sandbox (por UUID o slug). Los espacios personales o de
   *   equipo no son accesibles por la vía pública.
   */
  async resolvePublicSpace(spaceIdOrSlug?: string): Promise<Space> {
    if (!spaceIdOrSlug) {
      return this.getDemoSpace();
    }
    const space = isUuid(spaceIdOrSlug)
      ? await this.prisma.space.findUnique({ where: { id: spaceIdOrSlug } })
      : await this.prisma.space.findUnique({ where: { slug: spaceIdOrSlug } });
    if (!space) {
      throw new NotFoundException({
        code: 'SPACE_NOT_FOUND',
        message: 'El espacio indicado no existe. Crea un sandbox con POST /api/v1/public/sandboxes.',
      });
    }
    if (space.type === SpaceType.SANDBOX && space.expiresAt && space.expiresAt.getTime() <= Date.now()) {
      await this.files.deleteManyForSpace(space.id).catch(() => undefined);
      await this.prisma.space.delete({ where: { id: space.id } }).catch(() => undefined);
      throw new ForbiddenException({
        code: 'SANDBOX_EXPIRED',
        message: 'El sandbox expiró y sus datos fueron eliminados. Crea uno nuevo.',
      });
    }
    if (space.type === SpaceType.PERSONAL || space.type === SpaceType.TEAM) {
      throw new ForbiddenException({
        code: 'SPACE_REQUIRES_AUTH',
        message: 'Ese espacio requiere autenticación. Usa /api/v1/products con tu token.',
      });
    }
    return space;
  }

  // ── Sandboxes anónimos ────────────────────────────────────────────────────

  /** Crea un sandbox anónimo con slug de alta entropía y TTL configurado. */
  async createAnonymousSandbox(): Promise<Space> {
    const ttlHours = this.config.getOrThrow<number>('SANDBOX_TTL_HOURS');
    const slug = `sandbox-${randomBytes(12).toString('hex')}`;
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
    return this.prisma.space.create({
      data: { slug, type: SpaceType.SANDBOX, name: 'Sandbox anónimo', expiresAt },
    });
  }

  /** Elimina sandboxes vencidos (cascada borra sus recursos y objetos S3). */
  async sweepExpiredSandboxes(): Promise<number> {
    const expired = await this.prisma.space.findMany({
      where: { type: SpaceType.SANDBOX, expiresAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const space of expired) {
      // Best-effort: si falla el almacenamiento, se registra y se continúa.
      await this.files.deleteManyForSpace(space.id).catch((err: unknown) => {
        this.logger.warn(`Limpieza de archivos incompleta en ${space.id}: ${String(err)}`);
      });
    }
    const result = await this.prisma.space.deleteMany({
      where: { type: SpaceType.SANDBOX, expiresAt: { lte: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Sandboxes expirados eliminados: ${result.count}`);
    }
    return result.count;
  }

  // ── Espacios de equipo y miembros ─────────────────────────────────────────

  async createTeam(user: { id: string; email: string }, dto: CreateTeamDto): Promise<Space> {
    const slugBase = `equipo-${dto.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'practicas'}`;
    const slug = `${slugBase}-${randomBytes(4).toString('hex')}`;
    return this.prisma.$transaction(async (tx) => {
      const space = await tx.space.create({
        data: { slug, type: SpaceType.TEAM, name: dto.name, ownerId: user.id },
      });
      await tx.spaceMembership.create({
        data: {
          spaceId: space.id,
          userId: user.id,
          role: MembershipRole.ADMINISTRADOR,
        },
      });
      return space;
    });
  }

  async listMembers(spaceId: string) {
    return this.prisma.spaceMembership.findMany({
      where: { spaceId },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async inviteMember(spaceId: string, dto: InviteMemberDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'No existe un usuario registrado con ese correo.',
      });
    }
    const existing = await this.prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId, userId: user.id } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'MEMBER_ALREADY_EXISTS',
        message: 'Ese usuario ya es miembro del espacio.',
      });
    }
    return this.prisma.spaceMembership.create({
      data: { spaceId, userId: user.id, role: dto.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async updateMemberRole(spaceId: string, userId: string, dto: UpdateMemberDto) {
    const space = await this.getSpace(spaceId);
    if (space.ownerId === userId) {
      throw new BadRequestException({
        code: 'OWNER_ROLE_IMMUTABLE',
        message: 'El propietario siempre es ADMINISTRADOR.',
      });
    }
    const result = await this.prisma.spaceMembership.updateMany({
      where: { spaceId, userId },
      data: { role: dto.role },
    });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'Ese usuario no es miembro del espacio.',
      });
    }
    return this.listMembers(spaceId).then((members) =>
      members.find((member) => member.userId === userId),
    );
  }

  async removeMember(spaceId: string, userId: string): Promise<void> {
    const space = await this.getSpace(spaceId);
    if (space.ownerId === userId) {
      throw new BadRequestException({
        code: 'OWNER_CANNOT_BE_REMOVED',
        message: 'El propietario no puede ser removido de su espacio.',
      });
    }
    const result = await this.prisma.spaceMembership.deleteMany({ where: { spaceId, userId } });
    if (result.count === 0) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'Ese usuario no es miembro del espacio.',
      });
    }
  }

  /** Rol que el solicitante tiene en un espacio (para las políticas). */
  async roleOf(spaceId: string, userId: string): Promise<MembershipRole> {
    return this.access.roleIn(await this.getSpace(spaceId), userId);
  }

  // ── Reinicio de espacio (idempotente) ─────────────────────────────────────

  /**
   * Borra SOLO los datos del espacio indicado (nunca volúmenes ni la BD
   * completa) y deja constancia en SpaceResetAudit. En la demo pública además
   * restaura los datos canónicos, por lo que repetir el reset da el mismo
   * resultado.
   */
  async resetSpace(spaceId: string, requestedBy?: string, reason = 'manual'): Promise<Space> {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException({
        code: 'SPACE_NOT_FOUND',
        message: 'El espacio indicado no existe.',
      });
    }

    // Limpieza coordinada de objetos (best-effort; ver README, reconciliación).
    await this.files
      .deleteManyForSpace(spaceId)
      .catch((err: unknown) => this.logger.warn(`Limpieza de archivos incompleta en ${spaceId}: ${String(err)}`));

    await this.prisma.$transaction([
      // Etapa 3: primero el comercio, para no chocar con la FK Restrict de
      // OrderItem → Product (los snapshots históricos se borran con el pedido).
      this.prisma.idempotencyRecord.deleteMany({ where: { spaceId } }),
      this.prisma.order.deleteMany({ where: { spaceId } }),
      this.prisma.cartItem.deleteMany({ where: { cart: { spaceId } } }),
      this.prisma.cart.deleteMany({ where: { spaceId } }),
      this.prisma.note.deleteMany({ where: { spaceId } }),
      this.prisma.product.deleteMany({ where: { spaceId } }),
      this.prisma.category.deleteMany({ where: { spaceId } }),
      this.prisma.task.deleteMany({ where: { spaceId } }),
      // El reset devuelve el simulador a su estado estable (sin escenarios).
      this.prisma.spaceScenarioConfig.deleteMany({ where: { spaceId } }),
      // El replay no debe devolver eventos de recursos que ya no existen.
      this.prisma.realtimeEvent.deleteMany({ where: { spaceId } }),
      this.prisma.spaceResetAudit.create({
        data: { spaceId, requestedBy: requestedBy ?? null, reason },
      }),
    ]);

    if (space.type === SpaceType.DEMO) {
      await ensureDemoSpace(this.prisma);
    }
    await this.realtime.recordSafely(spaceId, 'SPACE', {
      action: 'reset',
      resourceType: 'SPACE',
      resourceId: spaceId,
      reason,
    });
    return space;
  }
}
