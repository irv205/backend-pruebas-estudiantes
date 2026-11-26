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
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug de un espacio de equipo. Omítelo para usar tu espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos del espacio autorizado (paginado)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryProductsDto,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.products.list(space.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un producto del espacio autorizado' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return { data: await this.products.findOne(space.id, id) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear producto (lector recibe 403)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: CreateProductDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.products.create(space, user.id, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar producto (409 si la versión no coincide)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.products.update(space, id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar producto del espacio autorizado' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceId);
    await this.products.remove(space, id);
  }
}
