import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/** Inyecta el usuario autenticado (`req.user`) en controladores protegidos. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.user;
});
