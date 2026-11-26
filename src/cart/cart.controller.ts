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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('cart')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug de un espacio de equipo. Omítelo para tu espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Carrito del usuario en el espacio, con totales del servidor' })
  async get(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.cart.get(space.id, user.id);
  }

  @Post('items')
  @HttpCode(201)
  @ApiOperation({ summary: 'Añadir { productId, quantity } al carrito' })
  async add(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: AddCartItemDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return this.cart.addItem(space, user.id, dto);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Cambiar la cantidad de un producto del carrito' })
  async update(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return this.cart.updateItem(space, user.id, productId, dto);
  }

  @Delete('items/:productId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quitar un producto del carrito' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('productId') productId: string,
  ): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceId);
    await this.cart.removeItem(space, user.id, productId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Vaciar el carrito' })
  async clear(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
  ): Promise<void> {
    const { space } = await this.access.require(user, 'write', spaceId);
    await this.cart.clear(space, user.id);
  }
}
