import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { PayOrderDto } from './dto/pay-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { assertIdempotencyKey, OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug de un espacio de equipo. Omítelo para tu espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly access: SpaceAccessService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Crear pedido desde el carrito (requiere cabecera Idempotency-Key)',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const key = assertIdempotencyKey(idempotencyKey);
    const { space, role } = await this.access.require(user, 'write', spaceId);
    return this.orders.create(user, space, key);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pedidos paginados (filtro opcional por status)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryOrdersDto,
  ) {
    const { space, role } = await this.access.require(user, 'read', spaceId);
    return this.orders.list(user, space, role, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de pedido con ítems y pagos' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space, role } = await this.access.require(user, 'read', spaceId);
    return this.orders.detail(user, space, role, id);
  }

  @Post(':id/pay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Simular pago: APPROVED → PAID, REJECTED → FAILED, PENDING → reintento' })
  async pay(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: PayOrderDto,
  ) {
    const { space, role } = await this.access.require(user, 'write', spaceId);
    return this.orders.pay(user, space, role, id, dto.outcome);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar pedido pendiente o pagado y reponer stock' })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space, role } = await this.access.require(user, 'write', spaceId);
    return this.orders.cancel(user, space, role, id);
  }
}
