import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { CreateNoteDto } from './create-note.dto';

export class UpdateNoteDto extends PartialType(CreateNoteDto) {
  /** Versión actual: si no coincide, la API responde 409 VERSION_CONFLICT. */
  @IsInt({ message: 'La versión debe ser un entero.' })
  @Min(1, { message: 'La versión debe ser mayor o igual a 1.' })
  @Type(() => Number)
  version!: number;
}
