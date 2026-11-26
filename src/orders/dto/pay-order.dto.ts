import { IsEnum } from 'class-validator';
import { PaymentOutcome } from '@prisma/client';

/** Pago simulado: nunca se realiza ningún cobro real. */
export class PayOrderDto {
  @IsEnum(PaymentOutcome, {
    message: 'outcome debe ser APPROVED, REJECTED o PENDING.',
  })
  outcome!: PaymentOutcome;
}
