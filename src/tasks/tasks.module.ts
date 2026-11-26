import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [SpaceAccessModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
