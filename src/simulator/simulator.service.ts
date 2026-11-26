import { Injectable } from '@nestjs/common';
import { SpaceScenarioConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateScenariosDto } from './dto/update-scenarios.dto';

@Injectable()
export class SimulatorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sin fila = API estable. Se crea al consultar/activar explícitamente. */
  async get(spaceId: string): Promise<SpaceScenarioConfig> {
    const existing = await this.prisma.spaceScenarioConfig.findUnique({ where: { spaceId } });
    if (existing) return existing;
    return this.prisma.spaceScenarioConfig.create({ data: { spaceId } });
  }

  async update(spaceId: string, dto: UpdateScenariosDto): Promise<SpaceScenarioConfig> {
    const data: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      if (key === 'slowResponse') data.slowResponse = value;
      else if (key === 'timeout') data.timeout = value;
      else if (key === 'temporary503') data.temporary503 = value;
      else if (key === 'sessionExpired') data.sessionExpired = value;
      else if (key === 'insufficientPermission') data.insufficientPermission = value;
      else if (key === 'emptyList') data.emptyList = value;
      else if (key === 'largeVolume') data.largeVolume = value;
      else if (key === 'concurrentEdit') data.concurrentEdit = value;
      else if (key === 'rateLimit') data.rateLimit = value;
      else if (key === 'invalidFile') data.invalidFile = value;
      else if (key === 'duplicateOrder') data.duplicateOrder = value;
    }
    return this.prisma.spaceScenarioConfig.upsert({
      where: { spaceId },
      update: data,
      create: { spaceId, ...data },
    });
  }

  /** Configuración efectiva: nunca aplica escenarios a espacios sin fila. */
  async activeFor(spaceId: string): Promise<SpaceScenarioConfig | null> {
    return this.prisma.spaceScenarioConfig.findUnique({ where: { spaceId } });
  }
}
