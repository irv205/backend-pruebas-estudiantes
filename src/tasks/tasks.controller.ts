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
import { CreateSubtaskDto, CreateTaskDto } from './dto/create-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { UpdateSubtaskDto } from './dto/subtask.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug de un espacio de equipo. Omítelo para usar tu espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar tareas (filtros por estado, prioridad y fecha)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryTasksDto,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.tasks.list(space.id, user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una tarea con sus subtareas' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return { data: await this.tasks.findOne(space.id, id) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear tarea (lector recibe 403)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: CreateTaskDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.tasks.create(space.id, user.id, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar tarea (409 por versión o transición inválida)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.tasks.update(space.id, id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar tarea' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceId);
    await this.tasks.remove(space.id, id);
  }

  @Post(':id/subtasks')
  @HttpCode(201)
  @ApiOperation({ summary: 'Añadir subtarea' })
  async addSubtask(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: CreateSubtaskDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.tasks.addSubtask(space.id, id, dto) };
  }

  @Patch(':id/subtasks/:subtaskId')
  @ApiOperation({ summary: 'Editar subtarea' })
  async updateSubtask(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Param('subtaskId') subtaskId: string,
    @Body() dto: UpdateSubtaskDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.tasks.updateSubtask(space.id, id, subtaskId, dto) };
  }

  @Delete(':id/subtasks/:subtaskId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar subtarea' })
  async removeSubtask(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Param('subtaskId') subtaskId: string,
  ): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceId);
    await this.tasks.removeSubtask(space.id, id, subtaskId);
  }
}
