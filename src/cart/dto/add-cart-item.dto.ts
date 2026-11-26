import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @IsUUID(undefined, { message: 'productId debe ser un UUID válido.' })
  productId!: string;

  /** El cliente envía cantidad, NUNCA importes: los totales son del servidor. */
  @Type(() => Number)
  @IsInt({ message: 'quantity debe ser un entero.' })
  @Min(1, { message: 'quantity debe ser mayor o igual a 1.' })
  @Max(1000, { message: 'quantity no puede exceder 1000.' })
  quantity!: number;
}
