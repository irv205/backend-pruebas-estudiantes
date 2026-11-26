import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { ProductsModule } from '../products/products.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SpacesModule } from '../spaces/spaces.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { PublicCategoriesController } from './public-categories.controller';

@Module({
  imports: [ProductsModule, SpacesModule, SpaceAccessModule, RealtimeModule],
  controllers: [CategoriesController, PublicCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
