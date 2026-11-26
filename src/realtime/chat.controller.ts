import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { QueryChatMessagesDto } from './dto/query-chat-messages.dto';
import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';

@ApiTags('chat')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-space-id',
  required: false,
  description: 'UUID o slug del espacio; omítelo para el espacio personal.',
})
@UseGuards(JwtAuthGuard)
@Controller('chat/rooms')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly access: SpaceAccessService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear sala de chat en el espacio (solo EDITOR/ADMIN)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Body() dto: CreateRoomDto,
  ) {
    const { space } = await this.access.require(user, 'write', spaceId);
    return { data: await this.chat.create(user, space, dto) };
  }

  @Get()
  @ApiOperation({ summary: 'Listar salas del espacio' })
  async list(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return { data: await this.chat.list(user, space) };
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Historial paginado de una sala (por sequence)' })
  async messages(
    @CurrentUser() user: AuthUser,
    @Headers('x-space-id') spaceId: string | undefined,
    @Param('id') id: string,
    @Query() query: QueryChatMessagesDto,
  ) {
    const { space } = await this.access.require(user, 'read', spaceId);
    return this.chat.messages(user, space, id, query);
  }
}
