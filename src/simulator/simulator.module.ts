import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SpaceAccessModule } from '../access/space-access.module';
import { ScenarioInterceptor } from './scenario.interceptor';
import { ScenariosController } from './scenarios.controller';
import { SimulatorService } from './simulator.service';

@Module({
  imports: [SpaceAccessModule],
  controllers: [ScenariosController],
  providers: [
    SimulatorService,
    { provide: APP_INTERCEPTOR, useClass: ScenarioInterceptor },
  ],
  exports: [SimulatorService],
})
export class SimulatorModule {}
