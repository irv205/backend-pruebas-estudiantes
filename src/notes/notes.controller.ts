import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CreateNoteDto } from './dto/create-note.dto';
import { QueryNotesDto } from './dto/query-notes.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NotesService } from './notes.service';

@ApiTags('notes')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug de un espacio de equipo. Omítelo para usar tu espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('notes')
export class NotesController {
  constructor(
    private readonly notes: NotesService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar notas propias (paginado, filtros y búsqueda)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryNotesDto,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.notes.list(space.id, user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una nota propia' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return { data: await this.notes.findOne(space.id, user.id, id) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear nota' })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: CreateNoteDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.notes.create(space.id, user.id, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar nota (409 si la versión no coincide)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.notes.update(space.id, user.id, id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar nota' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceId);
    await this.notes.remove(space.id, user.id, id);
  }
}
