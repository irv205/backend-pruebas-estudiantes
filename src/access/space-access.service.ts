import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Space, SpaceType } from '@prisma/client';
import { AuthUser } from '../common/types/auth-user';
import { isUuid } from '../common/utils/uuid.util';
import { PrismaService } from '../prisma/prisma.service';

/** Acción que un usuario intenta realizar sobre los recursos de un espacio. */
export type SpaceAction = 'read' | 'write' | 'manage';

/**
 * Resolución centralizada del espacio autorizado y del rol del usuario.
 *
 * - Sin `x-space-id`: espacio personal del usuario (el propietario es
 *   ADMINISTRADOR, como en la Etapa 1).
 * - Con `x-space-id`: se permite a cualquier miembro del espacio de equipo;
 *   el rol determine qué puede hacer.
 * - Un usuario ajeno NUNCA puede usar el id de otro espacio para leer o
 *   modificar recursos.
 */
@Injectable()
export class SpaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(user: AuthUser, spaceIdOrSlug?: string): Promise<Space> {
    if (!spaceIdOrSlug || spaceIdOrSlug === user.spaceId) {
      const own = await this.prisma.space.findUnique({ where: { id: user.spaceId } });
      if (!own) {
        throw new NotFoundException({
          code: 'SPACE_NOT_FOUND',
          message: 'Tu espacio personal no existe.',
        });
      }
      return own;
    }

    const space = isUuid(spaceIdOrSlug)
      ? await this.prisma.space.findUnique({ where: { id: spaceIdOrSlug } })
      : await this.prisma.space.findUnique({ where: { slug: spaceIdOrSlug } });
    if (!space) {
      throw new NotFoundException({
        code: 'SPACE_NOT_FOUND',
        message: 'El espacio indicado no existe.',
      });
    }
    // Comprobar pertenencia aunque el cliente ya conozca el id/slug.
    await this.roleIn(space, user.id);
    return space;
  }

  /** Rol efectivo: el propietario manda; si no, la membresía. */
  async roleIn(space: Space, userId: string): Promise<MembershipRole> {
    if (space.ownerId === userId) return MembershipRole.ADMINISTRADOR;
    const membership = await this.prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId: space.id, userId } },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'SPACE_ACCESS_DENIED',
        message: 'No tienes acceso a ese espacio.',
      });
    }
    return membership.role;
  }

  /** Lector: solo consulta. Editor: recursos. Administrador: todo. */
  assertRole(role: MembershipRole, action: SpaceAction): void {
    const allowed =
      action === 'read'
        ? true
        : action === 'write'
          ? role === MembershipRole.EDITOR || role === MembershipRole.ADMINISTRADOR
          : role === MembershipRole.ADMINISTRADOR;
    if (!allowed) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message:
          action === 'manage'
            ? 'Necesitas rol ADMINISTRADOR para gestionar miembros, escenarios o reinicios.'
            : 'Tu rol solo permite consultar los recursos de este espacio.',
        fields: { role: [role] },
      });
    }
  }

  /** Resuelve el espacio y valida el rol en una sola llamada. */
  async require(
    user: AuthUser,
    action: SpaceAction,
    spaceIdOrSlug?: string,
  ): Promise<{ space: Space; role: MembershipRole }> {
    const space = await this.resolveForUser(user, spaceIdOrSlug);
    const role = await this.roleIn(space, user.id);
    this.assertRole(role, action);
    return { space, role };
  }

  /** Solo aplica a la demo/sandbox: la demo pública es de solo lectura. */
  assertWritable(space: Space): void {
    if (space.type === SpaceType.DEMO) {
      throw new ForbiddenException({
        code: 'DEMO_READ_ONLY',
        message: 'La demo pública es de solo lectura. Crea un sandbox con POST /api/v1/public/sandboxes.',
      });
    }
  }
}
