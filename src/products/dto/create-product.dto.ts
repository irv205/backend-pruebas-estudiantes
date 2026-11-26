import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio.' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Importe entero en unidad mínima de la moneda (p. ej. centavos). */
  @IsInt({ message: 'El precio debe ser un entero en unidad mínima (centavos).' })
  @Min(0, { message: 'El precio no puede ser negativo.' })
  @Type(() => Number)
  price!: number;

  /** Código de moneda ISO 4217 (3 letras mayúsculas). */
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Debe ser un código de moneda de 3 letras (p. ej. MXN).' })
  currency?: string;

  @IsOptional()
  @IsInt({ message: 'El stock debe ser un entero.' })
  @Min(0, { message: 'El stock no puede ser negativo.' })
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsEnum(ProductStatus, { message: 'Estado inválido (ACTIVE o INACTIVE).' })
  status?: ProductStatus;

  @IsOptional()
  @IsUUID(undefined, { message: 'categoryId debe ser un UUID válido.' })
  categoryId?: string;

  /** Referencias a imágenes (URLs o claves). La subida real es Etapa 2. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  images?: string[];
}
