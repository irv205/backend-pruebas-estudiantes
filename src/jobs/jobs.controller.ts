import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CreateExportDto } from './dto/create-export.dto';
import { QueryExportsDto } from './dto/query-exports.dto';
import { ExportsService } from './exports.service';

@ApiTags('jobs')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug del espacio; omítelo para el espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('jobs/exports')
export class JobsController {
  constructor(
    private readonly exports: ExportsService,
    private readonly access: SpaceAccessService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear exportación asíncrona (PRODUCTS_CSV o NOTES_CSV)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: CreateExportDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.exports.create(user, space, dto) };
  }

  @Get()
  @ApiOperation({ summary: 'Listar trabajos del espacio (paginado, filtro status)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryExportsDto,
  ) {
    const { space, role } = await this.access.require(user, 'read', spaceId);
    return this.exports.list(user, space, role, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Estado de un trabajo (PENDING/PROCESSING/COMPLETED/FAILED)' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space, role } = await this.access.require(user, 'read', spaceId);
    return { data: await this.exports.detail(user, space, role, id) };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Descargar el CSV generado (solo si COMPLETED)' })
  async download(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { space, role } = await this.access.require(user, 'read', spaceId);
    const { file, body } = await this.exports.download(user, space, role, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Length', body.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.originalName.replace(/["\r\n]/g, '_')}"`,
    );
    res.send(body);
  }
}
