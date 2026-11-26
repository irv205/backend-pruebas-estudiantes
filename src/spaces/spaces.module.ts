import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { PublicSpacesController } from './public-spaces.controller';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

@Module({
  imports: [AuthModule, FilesModule, SpaceAccessModule],
  controllers: [SpacesController, PublicSpacesController],
  providers: [SpacesService],
  exports: [SpacesService],
})
export class SpacesModule {}
