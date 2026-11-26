import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Debe ser un correo válido.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'La contraseña es obligatoria.' })
  password!: string;
}
