import { Module } from '@nestjs/common';
import { SpaceAccessModule } from '../access/space-access.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [SpaceAccessModule],
  controllers: [ChatController],
  providers: [RealtimeEmitter, RealtimeEventsService, RealtimeGateway, ChatService],
  exports: [RealtimeEmitter, RealtimeEventsService, RealtimeGateway, ChatService],
})
export class RealtimeModule {}
