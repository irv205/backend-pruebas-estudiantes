import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const NOTE_SORT_FIELDS = ['createdAt', 'updatedAt', 'title'] as const;
export type NoteSortField = (typeof NOTE_SORT_FIELDS)[number];

function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}

export class QueryNotesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Busca en título y contenido. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Etiquetas separadas por coma. Se induce coincidencia con cualquiera de ellas. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tags?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsIn(NOTE_SORT_FIELDS, {
    message: `sort debe ser uno de: ${NOTE_SORT_FIELDS.join(', ')}.`,
  })
  sort?: NoteSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: "order debe ser 'asc' o 'desc'." })
  order?: 'asc' | 'desc';
}
