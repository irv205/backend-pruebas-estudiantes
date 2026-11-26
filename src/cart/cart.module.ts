import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [SpaceAccessModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
