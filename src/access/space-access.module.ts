import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpaceAccessService } from './space-access.service';

@Module({
  imports: [PrismaModule],
  providers: [SpaceAccessService],
  exports: [SpaceAccessService],
})
export class SpaceAccessModule {}
