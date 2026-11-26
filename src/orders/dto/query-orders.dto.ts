import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class QueryOrdersDto {
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

  @IsOptional()
  @IsEnum(OrderStatus, {
    message: 'status debe ser PENDING_PAYMENT, PAID, FAILED o CANCELLED.',
  })
  status?: OrderStatus;
}
