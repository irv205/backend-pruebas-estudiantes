import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

interface AccessTokenPayload {
  sub: string;
  email: string;
  spaceId: string;
}

/**
 * Guard de acceso: exige `Authorization: Bearer <accessToken>`.
 * Rellena `req.user` con `{ id, email, spaceId }`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_MISSING',
        message: 'Falta el token de acceso. Usa el encabezado Authorization: Bearer <token>.',
      });
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      req.user = { id: payload.sub, email: payload.email, spaceId: payload.spaceId };
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'El token de acceso expiró. Renueva la sesión con /auth/refresh.',
        });
      }
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'El token de acceso no es válido.',
      });
    }
  }
}
