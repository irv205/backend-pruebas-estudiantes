import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReplayEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lastEventId = 0;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
