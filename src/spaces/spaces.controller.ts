import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto, UpdateMemberDto } from './dto/member.dto';
import { SpacesService } from './spaces.service';

@ApiTags('spaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spaces')
export class SpacesController {
  constructor(
    private readonly spaces: SpacesService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Información del espacio personal actual' })
  async mySpace(@CurrentUser() user: AuthUser) {
    const space = await this.spaces.getSpace(user.spaceId);
    return {
      data: {
        id: space.id,
        slug: space.slug,
        type: space.type,
        name: space.name,
        createdAt: space.createdAt,
      },
    };
  }

  @Post('me/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reiniciar el espacio personal (borra solo sus datos)' })
  async resetMySpace(@CurrentUser() user: AuthUser) {
    const space = await this.spaces.resetSpace(user.spaceId, user.id);
    return {
      data: {
        spaceId: space.id,
        message: 'Espacio reiniciado. Sus productos, categorías, tareas, archivos y notas fueron eliminados.',
      },
    };
  }

  @Post('teams')
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear un espacio de equipo (el creador es ADMINISTRADOR)' })
  async createTeam(@CurrentUser() user: AuthUser, @Body() dto: CreateTeamDto) {
    const space = await this.spaces.createTeam(user, dto);
    return {
      data: {
        id: space.id,
        slug: space.slug,
        type: space.type,
        name: space.name,
        role: 'ADMINISTRADOR',
      },
    };
  }

  @Get(':spaceId/members')
  @ApiOperation({ summary: 'Listar miembros (solo ADMINISTRADOR)' })
  async listMembers(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string) {
    await this.access.require(user, 'manage', spaceId);
    return { data: await this.spaces.listMembers(spaceId) };
  }

  @Post(':spaceId/members')
  @HttpCode(201)
  @ApiOperation({ summary: 'Invitar a un usuario registrado (solo ADMINISTRADOR)' })
  async inviteMember(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: InviteMemberDto,
  ) {
    await this.access.require(user, 'manage', spaceId);
    return { data: await this.spaces.inviteMember(spaceId, dto) };
  }

  @Patch(':spaceId/members/:userId')
  @ApiOperation({ summary: 'Cambiar el rol de un miembro (solo ADMINISTRADOR)' })
  async updateMemberRole(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    await this.access.require(user, 'manage', spaceId);
    return { data: await this.spaces.updateMemberRole(spaceId, userId, dto) };
  }

  @Delete(':spaceId/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remover un miembro (solo ADMINISTRADOR)' })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.access.require(user, 'manage', spaceId);
    await this.spaces.removeMember(spaceId, userId);
  }

  @Post(':spaceId/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reiniciar un espacio de equipo (solo ADMINISTRADOR)' })
  async resetTeamSpace(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string) {
    await this.access.require(user, 'manage', spaceId);
    const space = await this.spaces.resetSpace(spaceId, user.id, 'team-reset');
    return {
      data: {
        spaceId: space.id,
        message: 'Espacio reiniciado. Recursos, archivos y escenarios eliminados.',
      },
    };
  }
}
