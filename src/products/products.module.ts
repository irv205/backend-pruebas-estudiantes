import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SpacesModule } from '../spaces/spaces.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PublicProductsController } from './public-products.controller';

@Module({
  imports: [AuthModule, SpacesModule, FilesModule, SpaceAccessModule, RealtimeModule],
  controllers: [ProductsController, PublicProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
