import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /** Token de un solo uso recibido por correo (Mailpit). */
  @IsString()
  @MinLength(10, { message: 'El token es obligatorio.' })
  token!: string;

  /** Nueva contraseña: mínimo 8 caracteres, con letras y números. */
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no debe exceder 72 caracteres.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'La contraseña debe incluir letras y números.',
  })
  password!: string;
}
