import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  /**
   * Versión actual del producto (control de concurrencia optimista).
   * Si no coincide con la almacenada, la API responde 409 VERSION_CONFLICT.
   */
  @IsInt({ message: 'La versión debe ser un entero.' })
  @Min(1, { message: 'La versión debe ser mayor o igual a 1.' })
  @Type(() => Number)
  version!: number;
}
