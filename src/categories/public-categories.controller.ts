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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Space, SpaceType } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { SpacesService } from '../spaces/spaces.service';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoriesDto } from './dto/query-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Categorías sin login: la demo pública solo consulta categorías ACTIVAS;
 * los sandboxes anónimos (`x-space-id`) pueden gestionar las suyas.
 */
@ApiTags('public')
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug del sandbox. Omítelo para consultar la demo pública.',
})
@Controller('public/categories')
export class PublicCategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly spaces: SpacesService,
  ) {}

  private async resolve(spaceId?: string): Promise<{ space: Space; activeOnly: boolean }> {
    const space = await this.spaces.resolvePublicSpace(spaceId);
    return { space, activeOnly: space.type === SpaceType.DEMO };
  }

  @Get()
  @ApiOperation({ summary: 'Listar categorías activas de la demo o del sandbox' })
  async list(
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryCategoriesDto,
  ) {
    const { space, activeOnly } = await this.resolve(spaceId);
    return this.categories.list(space.id, query, activeOnly);
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Productos de una categoría de la demo o del sandbox' })
  async productsOf(
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Query() query: QueryCategoriesDto,
  ) {
    const { space, activeOnly } = await this.resolve(spaceId);
    return this.categories.productsOf(space.id, id, query, activeOnly);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una categoría' })
  async detail(@Headers('x-space-id') spaceId: string | undefined, @Param('id') id: string) {
    const { space, activeOnly } = await this.resolve(spaceId);
    return { data: await this.categories.findOne(space.id, id, activeOnly) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear categoría en un sandbox (la demo es solo lectura)' })
  async create(@Headers('x-space-id') spaceId: string | undefined, @Body() dto: CreateCategoryDto) {
    const { space } = await this.resolve(spaceId);
    this.assertWritable(space);
    return { data: await this.categories.create(space, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar categoría del sandbox (409 si la versión no coincide)' })
  async update(
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const { space } = await this.resolve(spaceId);
    this.assertWritable(space);
    return { data: await this.categories.update(space, id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar categoría del sandbox' })
  async remove(@Headers('x-space-id') spaceId: string | undefined, @Param('id') id: string) {
    const { space } = await this.resolve(spaceId);
    this.assertWritable(space);
    await this.categories.remove(space, id);
  }

  private assertWritable(space: Space): void {
    if (space.type === SpaceType.DEMO) {
      throw new ForbiddenException({
        code: 'DEMO_READ_ONLY',
        message: 'La demo pública es de solo lectura.',
      });
    }
  }
}
