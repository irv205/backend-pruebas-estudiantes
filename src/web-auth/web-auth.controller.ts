import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { randomToken } from '../common/utils/crypto.util';
import { cookieValue, serializeCookie } from './cookies.util';

export const REFRESH_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'csrf_token';
// Path acotado al API (no a todo el sitio); SameSite=Lax; Secure en producción.
const COOKIE_PATH = '/api/v1';

type SessionResult = Awaited<ReturnType<AuthService['login']>>;

@ApiTags('web-auth')
@Controller('auth')
export class WebAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('web/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login web: refresh token en cookie HttpOnly + token CSRF' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    const csrfToken = randomToken(32);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    this.setCsrfCookie(res, csrfToken);
    return { data: this.publicSession(result, csrfToken) };
  }

  @Post('web/refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotar sesión web leyendo la cookie refresh_token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = cookieValue(req, REFRESH_COOKIE);
    if (!token) {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_TOKEN_MISSING',
        message: 'No hay cookie de sesión. Inicia sesión con /auth/web/login.',
      });
    }
    const result = await this.auth.refresh(token);
    const csrfToken = cookieValue(req, CSRF_COOKIE) ?? randomToken(32);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    this.setCsrfCookie(res, csrfToken);
    return { data: this.publicSession(result, csrfToken) };
  }

  @Post('web/logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revocar la sesión web y limpiar las cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = cookieValue(req, REFRESH_COOKIE);
    if (token) await this.auth.logout(token);
    this.clearCookie(res, REFRESH_COOKIE);
    this.clearCookie(res, CSRF_COOKIE);
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Obtener token double-submit (cookie + cuerpo)' })
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = randomToken(32);
    this.setCsrfCookie(res, csrfToken);
    return { data: { csrfToken } };
  }

  private publicSession(result: SessionResult, csrfToken: string) {
    const { refreshToken: _refreshToken, ...tokens } = result.tokens;
    return { user: result.user, tokens, csrfToken };
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private setRefreshCookie(res: Response, token: string): void {
    const days = this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS');
    res.append(
      'Set-Cookie',
      serializeCookie(REFRESH_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.isProduction(),
        path: COOKIE_PATH,
        maxAge: days * 86400,
      }),
    );
  }

  private setCsrfCookie(res: Response, token: string): void {
    res.append(
      'Set-Cookie',
      serializeCookie(CSRF_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.isProduction(),
        path: COOKIE_PATH,
        maxAge: 86400,
      }),
    );
  }

  private clearCookie(res: Response, name: string): void {
    res.append(
      'Set-Cookie',
      serializeCookie(name, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.isProduction(),
        path: COOKIE_PATH,
        maxAge: 0,
      }),
    );
  }
}
