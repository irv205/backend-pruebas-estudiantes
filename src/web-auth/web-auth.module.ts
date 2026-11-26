import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { CsrfGuard } from './csrf.guard';
import { WebAuthController } from './web-auth.controller';

@Module({
  imports: [AuthModule],
  controllers: [WebAuthController],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class WebAuthModule {}
