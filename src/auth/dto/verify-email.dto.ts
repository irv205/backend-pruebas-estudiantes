import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  /** Token de verificación recibido por correo (Mailpit). */
  @IsString()
  @MinLength(10, { message: 'El token es obligatorio.' })
  token!: string;
}
