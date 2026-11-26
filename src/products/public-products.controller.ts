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
import { Space } from '@prisma/client';
import { SpacesService } from '../spaces/spaces.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

/**
 * Productos sin login:
 * - sin `x-space-id` → demo pública (solo lectura);
 * - con `x-space-id` → sandbox anónimo (CRUD, TTL/cuota).
 */
@ApiTags('public-products')
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug del sandbox. Omítelo para usar la demo pública (solo lectura).',
})
@Controller('public/products')
export class PublicProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly spaces: SpacesService,
  ) {}

  private resolve(spaceIdOrSlug?: string): Promise<Space> {
    return this.spaces.resolvePublicSpace(spaceIdOrSlug);
  }

  @Get()
  @ApiOperation({ summary: 'Listar productos de la demo o del sandbox (paginado)' })
  async list(
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryProductsDto,
  ) {
    const space = await this.resolve(spaceId);
    return this.products.list(space.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un producto de la demo o del sandbox' })
  async detail(@Headers('x-space-id') spaceId: string | undefined, @Param('id') id: string) {
    const space = await this.resolve(spaceId);
    return { data: await this.products.findOne(space.id, id) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear producto en un sandbox (la demo es solo lectura)' })
  async create(
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: CreateProductDto,
  ) {
    const space = await this.resolve(spaceId);
    return { data: await this.products.create(space, null, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar producto del sandbox (409 si la versión no coincide)' })
  async update(
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const space = await this.resolve(spaceId);
    return { data: await this.products.update(space, id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar producto del sandbox' })
  async remove(
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const space = await this.resolve(spaceId);
    await this.products.remove(space, id);
  }
}
