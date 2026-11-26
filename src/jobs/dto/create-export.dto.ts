import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { ExportKind } from '@prisma/client';

export class ExportFiltersDto {
  @IsOptional()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class CreateExportDto {
  @IsEnum(ExportKind)
  kind!: ExportKind;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExportFiltersDto)
  filters?: ExportFiltersDto;
}
