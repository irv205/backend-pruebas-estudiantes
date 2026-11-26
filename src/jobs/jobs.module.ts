import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SimulatorModule } from '../simulator/simulator.module';
import { ExportProcessorService } from './export.processor';
import { ExportWorkerService } from './export.worker';
import { ExportsService } from './exports.service';
import { JobsController } from './jobs.controller';
import { JobsQueueService } from './jobs.queue';

@Module({
  imports: [
    SpaceAccessModule,
    FilesModule,
    NotificationsModule,
    RealtimeModule,
    SimulatorModule,
  ],
  controllers: [JobsController],
  providers: [ExportsService, ExportProcessorService, JobsQueueService, ExportWorkerService],
  exports: [ExportsService, JobsQueueService, ExportProcessorService],
})
export class JobsModule {}
