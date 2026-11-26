import { Controller, Get, Headers, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug del espacio; omítelo para el espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Notificaciones del usuario en el espacio (paginado, unreadOnly)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Query() query: QueryNotificationsDto,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.notifications.list(user, space, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Número de notificaciones no leídas' })
  async unreadCount(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return { data: await this.notifications.unreadCount(user, space) };
  }

  @Patch('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marcar como leídas todas las notificaciones del usuario en el espacio' })
  async readAll(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.notifications.markAllRead(user, space) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una notificación' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return { data: await this.notifications.findOne(user, space, id) };
  }

  @Patch(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.notifications.markRead(user, space, id) };
  }
}
