import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Crear cuenta (crea también el espacio personal)' })
  async register(@Body() dto: RegisterDto) {
    return { data: await this.auth.register(dto) };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(@Body() dto: LoginDto) {
    return { data: await this.auth.login(dto) };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar sesión (refresh rotativo y revocable)' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return { data: await this.auth.refresh(dto.refreshToken) };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cerrar sesión actual (revoca el refresh token)' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña (correo vía Mailpit)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return { data: await this.auth.forgotPassword(dto) };
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Establecer nueva contraseña con token de un solo uso' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return { data: await this.auth.resetPassword(dto) };
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verificar correo con token de un solo uso' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return { data: await this.auth.verifyEmail(dto) };
  }
}
