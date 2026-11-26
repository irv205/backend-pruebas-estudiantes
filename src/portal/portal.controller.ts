import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { PortalService } from './portal.service';

@ApiTags('portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('manifest')
  @ApiOperation({ summary: 'URLs base, descargas, 12 escenarios y niveles 0-6 para el portal' })
  manifest() {
    return this.portal.manifest();
  }

  @Get('spaces')
  @ApiOperation({ summary: 'Espacios seleccionables: personal, equipos del usuario y demo pública' })
  async spaces(@CurrentUser() user: AuthUser) {
    return this.portal.listSpaces(user);
  }

  @Get('guide')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  @ApiOperation({ summary: 'Guía completa de coding challenges en Markdown' })
  async guide() {
    return this.portal.guide();
  }

  @Get('postman/collection')
  @ApiOperation({ summary: 'Descargar la collection de Postman (requiere Bearer)' })
  async collection(@Res() res: Response): Promise<void> {
    await this.sendPostman(res, 'collection');
  }

  @Get('postman/environment')
  @ApiOperation({ summary: 'Descargar el environment de Postman (requiere Bearer)' })
  async environment(@Res() res: Response): Promise<void> {
    await this.sendPostman(res, 'environment');
  }

  private async sendPostman(res: Response, kind: 'collection' | 'environment'): Promise<void> {
    const { content, fileName } = await this.portal.postmanFile(kind);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(content);
  }
}
