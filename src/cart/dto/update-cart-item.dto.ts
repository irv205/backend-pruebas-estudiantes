import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt({ message: 'quantity debe ser un entero.' })
  @Min(1, { message: 'quantity debe ser mayor o igual a 1.' })
  @Max(1000, { message: 'quantity no puede exceder 1000.' })
  quantity!: number;
}
