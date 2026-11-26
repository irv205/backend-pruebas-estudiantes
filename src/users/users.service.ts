import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FileKind, SpaceType } from '@prisma/client';
import * as argon2 from 'argon2';
import { toPublicUser } from '../auth/auth.service';
import { FileResponse, FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'El usuario ya no existe.',
      });
    }
    const space = await this.prisma.space.findFirst({
      where: { ownerId: userId, type: SpaceType.PERSONAL },
      select: { id: true, slug: true, type: true, name: true },
    });
    return { ...toPublicUser(user), space };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    let avatarUrl = dto.avatarUrl;
    if (dto.avatarFileId) {
      const file = await this.files.findOne(
        (await this.prisma.space.findFirstOrThrow({
          where: { ownerId: userId, type: SpaceType.PERSONAL },
          select: { id: true },
        })).id,
        dto.avatarFileId,
      );
      avatarUrl = `/api/v1/files/${file.id}/download`;
      const previous = await this.prisma.fileObject.findMany({
        where: {
          ownerId: userId,
          kind: FileKind.AVATAR,
          entityType: 'USER',
          entityId: userId,
          id: { not: file.id },
        },
        select: { id: true },
      });
      await this.files.deleteByIds(previous.map((item) => item.id));
      await this.prisma.fileObject.update({
        where: { id: file.id },
        data: { kind: FileKind.AVATAR, entityType: 'USER', entityId: userId },
      });
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
    });
    return toPublicUser(user);
  }

  /** Avatar: se guarda el nuevo objeto y se limpia el anterior (sin huérfanos). */
  async setAvatar(userId: string, uploaded: FileResponse) {
    const previous = await this.prisma.fileObject.findMany({
      where: {
        ownerId: userId,
        kind: FileKind.AVATAR,
        entityType: 'USER',
        entityId: userId,
        id: { not: uploaded.id },
      },
      select: { id: true },
    });
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: uploaded.downloadUrl },
    });
    await this.files.deleteByIds(previous.map((file) => file.id));
    return toPublicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const ok =
      user !== null &&
      (await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false));
    if (!ok) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'La contraseña actual no es correcta.',
      });
    }
    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Se revocan todas las sesiones; el token de acceso actual seguirá
      // válido hasta su expiración natural (documentado en README).
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Contraseña actualizada. Vuelve a iniciar sesión.' };
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const ok =
      user !== null && (await argon2.verify(user.passwordHash, dto.password).catch(() => false));
    if (!ok) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'La contraseña no es correcta.',
      });
    }
    // Limpieza coordinada de objetos antes de la cascada relacional.
    await this.files.deleteAllForUser(userId);
    await this.files.deleteByEntity('USER', userId);
    const owned = await this.prisma.space.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    for (const space of owned) await this.files.deleteManyForSpace(space.id);
    // Cascada: espacio personal → productos/notas/categorías/tareas/tokens.
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
