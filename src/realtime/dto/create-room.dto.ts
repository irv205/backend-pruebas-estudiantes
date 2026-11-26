import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  /** ids de usuario del mismo espacio; por defecto todos sus miembros. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}
