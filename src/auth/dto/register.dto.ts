import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  /** Correo de la cuenta (único en toda la plataforma). */
  @IsEmail({}, { message: 'Debe ser un correo válido.' })
  email!: string;

  /** Mínimo 8 caracteres, con letras y números. */
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no debe exceder 72 caracteres.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'La contraseña debe incluir letras y números.',
  })
  password!: string;

  /** Nombre visible del usuario. */
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  @MaxLength(120)
  name!: string;
}
