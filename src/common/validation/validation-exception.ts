import { UnprocessableEntityException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

/**
 * Convierte los errores de class-validator al contrato de la propuesta (§9):
 * `{ error: { code: 'VALIDATION_ERROR', message, fields }, requestId }`.
 * El filtro global añade el `requestId`.
 */
export function validationExceptionFactory(errors: ValidationError[] = []): Error {
  const fields: Record<string, string[]> = {};

  const collect = (error: ValidationError, prefix = ''): void => {
    const property = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      fields[property] = Object.values(error.constraints);
    }
    for (const child of error.children ?? []) collect(child, property);
  };

  for (const error of errors) collect(error);

  return new UnprocessableEntityException({
    code: 'VALIDATION_ERROR',
    message: 'Revisa los campos enviados.',
    fields,
  });
}
