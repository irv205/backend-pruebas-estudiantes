import { IsOptional, IsString, IsUrl, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  /** Nombre visible. */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres.' })
  @MaxLength(120)
  name?: string;

  /** URL del avatar ( opcional; alternativamente usa avatarFileId o POST /users/me/avatar). */
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'Debe ser una URL válida.' })
  @MaxLength(500)
  avatarUrl?: string;

  /** ID de un archivo ya subido con POST /api/v1/files (kind=AVATAR). */
  @IsOptional()
  @IsUUID(undefined, { message: 'avatarFileId debe ser un UUID.' })
  avatarFileId?: string;
}
