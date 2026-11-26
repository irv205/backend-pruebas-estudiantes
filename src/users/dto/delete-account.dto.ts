import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  /** Confirmación con la contraseña actual. */
  @IsString()
  @MinLength(1, { message: 'La contraseña es obligatoria para eliminar la cuenta.' })
  password!: string;
}
