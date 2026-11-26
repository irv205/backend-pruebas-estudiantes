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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoriesDto } from './dto/query-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug de un espacio de equipo. Omítelo para usar tu espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías del espacio autorizado (paginado)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryCategoriesDto,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.categories.list(space.id, query);
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Productos de una categoría (paginado)' })
  async productsOf(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Query() query: QueryCategoriesDto,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.categories.productsOf(space.id, id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una categoría' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return { data: await this.categories.findOne(space.id, id) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear categoría (nombre único por espacio)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: CreateCategoryDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.categories.create(space, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar categoría (409 si la versión no coincide)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.categories.update(space, id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar categoría' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceId);
    await this.categories.remove(space, id);
  }
}
