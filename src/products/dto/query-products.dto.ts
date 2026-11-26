import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const PRODUCT_SORT_FIELDS = ['name', 'price', 'stock', 'createdAt', 'updatedAt'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export class QueryProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'page debe ser mayor o igual a 1.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'limit debe ser mayor o igual a 1.' })
  @Max(100, { message: 'limit no puede exceder 100.' })
  limit?: number;

  /** Busca en nombre y descripción. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS, {
    message: `sort debe ser uno de: ${PRODUCT_SORT_FIELDS.join(', ')}.`,
  })
  sort?: ProductSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: "order debe ser 'asc' o 'desc'." })
  order?: 'asc' | 'desc';

  @IsOptional()
  @IsEnum(ProductStatus, { message: 'status debe ser ACTIVE o INACTIVE.' })
  status?: ProductStatus;

  @IsOptional()
  @IsUUID(undefined, { message: 'categoryId debe ser un UUID válido.' })
  categoryId?: string;
}
