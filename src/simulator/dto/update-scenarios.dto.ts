import { IsBoolean, IsOptional } from 'class-validator';
import { SCENARIO_KEYS } from '../scenarios';

/** Todos los escenarios son opcionales: los no enviados conservan su estado. */
export class UpdateScenariosDto {
  @IsOptional()
  @IsBoolean()
  slowResponse?: boolean;

  @IsOptional()
  @IsBoolean()
  timeout?: boolean;

  @IsOptional()
  @IsBoolean()
  temporary503?: boolean;

  @IsOptional()
  @IsBoolean()
  sessionExpired?: boolean;

  @IsOptional()
  @IsBoolean()
  insufficientPermission?: boolean;

  @IsOptional()
  @IsBoolean()
  emptyList?: boolean;

  @IsOptional()
  @IsBoolean()
  largeVolume?: boolean;

  @IsOptional()
  @IsBoolean()
  concurrentEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  rateLimit?: boolean;

  @IsOptional()
  @IsBoolean()
  invalidFile?: boolean;

  @IsOptional()
  @IsBoolean()
  duplicateOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  failedAsyncJob?: boolean;
}

/**Validación en tiempo de ejecución de las claves (defensa en profundidad). */
export function isScenarioKey(value: string): boolean {
  return (SCENARIO_KEYS as readonly string[]).includes(value);
}
