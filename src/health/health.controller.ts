import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints operativos de salud (fuera del prefijo /api/v1):
 * - GET /health/live  → proceso vivo; NO comprueba dependencias.
 * - GET /health/ready → listo para recibir tráfico; comprueba PostgreSQL.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: el proceso está vivo' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: incluye comprobación de PostgreSQL' })
  async ready(@Res() res: Response): Promise<Response> {
    try {
      await this.prisma.healthCheck();
      return res.status(200).json({ status: 'ok', database: 'up' });
    } catch {
      return res.status(503).json({ status: 'error', database: 'down' });
    }
  }
}
