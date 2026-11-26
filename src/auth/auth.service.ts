import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipRole, SpaceType, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { parseTtlSeconds, randomToken, sha256Hex } from '../common/utils/crypto.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenPair {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const VERIFICATION_TOKEN_TTL_HOURS = 24;
const PASSWORD_RESET_TOKEN_TTL_HOURS = 1;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // ── Registro ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'AUTH_EMAIL_ALREADY_EXISTS',
        message: 'Ya existe una cuenta registrada con ese correo.',
      });
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name: dto.name, passwordHash },
      });
      // Cada usuario obtiene su espacio personal persistente (Etapa 1: 1:1).
      const space = await tx.space.create({
        data: {
          slug: `personal-${created.id}`,
          type: SpaceType.PERSONAL,
          name: `Espacio de ${dto.name}`,
          ownerId: created.id,
        },
      });
      await tx.spaceMembership.create({
        data: { spaceId: space.id, userId: created.id, role: MembershipRole.ADMINISTRADOR },
      });
      return created;
    });

    await this.sendVerificationToken(user);
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    const passwordOk =
      user !== null && (await argon2.verify(user.passwordHash, dto.password).catch(() => false));
    if (!user || !passwordOk) {
      // Mismo mensaje para usuario inexistente y contraseña incorrecta.
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos.',
      });
    }
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  // ── Refresh (rotación + revocación) ───────────────────────────────────────

  async refresh(refreshToken: string): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(refreshToken) },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_TOKEN_INVALID',
        message: 'El refresh token no es válido.',
      });
    }
    if (stored.revokedAt) {
      // Reutilización de un token ya rotado/revocado: posible robo.
      // Se revocan TODAS las sesiones del usuario como medida de seguridad.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_TOKEN_REVOKED',
        message: 'La sesión fue revocada. Inicia sesión de nuevo.',
      });
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_TOKEN_EXPIRED',
        message: 'El refresh token expiró. Inicia sesión de nuevo.',
      });
    }

    // Rotación: el token viejo queda revocado y enlazado a su reemplazo.
    const tokens = await this.issueTokens(stored.user);
    const replacement = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(tokens.refreshToken) },
      select: { id: true },
    });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacement?.id ?? null },
    });

    return { user: toPublicUser(stored.user), tokens };
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(refreshToken) },
    });
    if (stored && !stored.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
    }
    // Idempotente: logout con token desconocido también responde 204.
  }

  // ── Recuperación de contraseña ────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (user) {
      const token = randomToken(32);
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_HOURS * 3600_000),
        },
      });
      await this.mail.sendPasswordResetEmail(user.email, token);
    }
    // Respuesta idéntica exista o no el correo (no se filtran cuentas).
    return { message: 'Si el correo está registrado, recibirás un enlace de recuperación.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(dto.token) },
    });
    if (!stored || stored.usedAt) {
      throw new BadRequestException({
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'El token de recuperación no es válido o ya fue utilizado.',
      });
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'PASSWORD_RESET_TOKEN_EXPIRED',
        message: 'El token de recuperación expiró. Solicita uno nuevo.',
      });
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      // Se cierran todas las sesiones abiertas al cambiar la contraseña.
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Contraseña actualizada. Inicia sesión con la nueva contraseña.' };
  }

  // ── Verificación de correo ────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const stored = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256Hex(dto.token) },
    });
    if (!stored) {
      throw new BadRequestException({
        code: 'VERIFICATION_TOKEN_INVALID',
        message: 'El token de verificación no es válido.',
      });
    }
    if (stored.usedAt) {
      // Idempotente: verificar dos veces no es un error.
      return { message: 'El correo ya estaba verificado.' };
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'VERIFICATION_TOKEN_EXPIRED',
        message: 'El token de verificación expiró.',
      });
    }
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { isVerified: true },
      }),
    ]);
    return { message: 'Correo verificado correctamente.' };
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async sendVerificationToken(user: User): Promise<void> {
    const token = randomToken(32);
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600_000),
      },
    });
    await this.mail.sendVerificationEmail(user.email, token);
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const space = await this.prisma.space.findFirst({
      where: { ownerId: user.id, type: SpaceType.PERSONAL },
      select: { id: true },
    });
    if (!space) {
      throw new InternalServerErrorException({
        code: 'PERSONAL_SPACE_MISSING',
        message: 'La cuenta no tiene espacio personal asignado.',
      });
    }

    const accessTtl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    const expiresIn = parseTtlSeconds(accessTtl);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, spaceId: space.id },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn },
    );

    const refreshToken = randomToken(48);
    const refreshDays = this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS');
    const refreshExpiresAt = new Date(Date.now() + refreshDays * 86400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      refreshToken,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }
}
