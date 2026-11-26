import { TaskPriority, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateSubtaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;
}

export class CreateTaskDto {
  @IsString()
  @MinLength(1, { message: 'El título es obligatorio.' })
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority, { message: 'priority debe ser LOW, MEDIUM, HIGH o URGENT.' })
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskStatus, { message: 'status debe ser TODO, IN_PROGRESS, DONE o CANCELLED.' })
  status?: TaskStatus;

  @IsOptional()
  @IsDateString({}, { message: 'dueAt debe ser una fecha ISO 8601.' })
  dueAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateSubtaskDto)
  subtasks?: CreateSubtaskDto[];
}
