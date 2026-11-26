import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileKind } from '@prisma/client';
import { Response } from 'express';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { QueryFilesDto } from './dto/query-files.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug de un espacio de equipo. Omítelo para usar tu espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly access: SpaceAccessService,
  ) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: Object.values(FileKind) },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Subir archivo (multipart/form-data, campo `file`)' })
  async upload(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind?: string,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return {
      data: await this.files.upload(user, space, file, this.parseKind(kind)),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Listar metadatos de archivos del espacio (paginado)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryFilesDto,
  ) {
    return this.files.listFor(user, spaceId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadatos de un archivo' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    return { data: await this.files.metadata(user, spaceId, id) };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Descarga autorizada (o URL prefirmada si está configurada)' })
  async download(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { file, body } = await this.files.download(user, spaceId, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', body.length);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/["\r\n]/g, '_')}"`);
    res.send(body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar archivo y su objeto' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    await this.files.remove(user, spaceId, id);
  }

  private parseKind(kind?: string): FileKind {
    if (!kind) return FileKind.OTHER;
    if (!Object.values(FileKind).includes(kind as FileKind)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_KIND',
        message: `kind debe ser uno de: ${Object.values(FileKind).join(', ')}.`,
      });
    }
    return kind as FileKind;
  }
}
