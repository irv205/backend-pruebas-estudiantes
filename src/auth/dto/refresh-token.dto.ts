import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  /** Refresh token opaco emitido en login/register/refresh. */
  @IsString()
  @MinLength(10, { message: 'El refresh token es obligatorio.' })
  refreshToken!: string;
}
