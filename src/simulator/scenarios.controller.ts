import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceScenarioConfig } from '@prisma/client';
import { SpaceAccessService } from '../access/space-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { UpdateScenariosDto } from './dto/update-scenarios.dto';
import { SCENARIO_DESCRIPTIONS } from './scenarios';
import { SimulatorService } from './simulator.service';

@ApiTags('simulator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spaces')
export class ScenariosController {
  constructor(
    private readonly simulator: SimulatorService,
    private readonly access: SpaceAccessService,
  ) {}

  @Get('me/scenarios')
  @ApiOperation({ summary: 'Consultar escenarios del espacio personal' })
  async myScenarios(@CurrentUser() user: AuthUser) {
    await this.access.require(user, 'manage');
    return this.render(await this.simulator.get(user.spaceId));
  }

  @Patch('me/scenarios')
  @ApiOperation({ summary: 'Activar/desactivar escenarios del espacio personal' })
  async updateMyScenarios(@CurrentUser() user: AuthUser, @Body() dto: UpdateScenariosDto) {
    await this.access.require(user, 'manage');
    return this.render(await this.simulator.update(user.spaceId, dto));
  }

  @Get(':spaceId/scenarios')
  @ApiOperation({ summary: 'Consultar escenarios de un espacio de equipo (solo ADMINISTRADOR)' })
  async scenarios(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string) {
    await this.access.require(user, 'manage', spaceId);
    return this.render(await this.simulator.get(spaceId));
  }

  @Patch(':spaceId/scenarios')
  @ApiOperation({ summary: 'Activar/desactivar escenarios de un espacio (solo ADMINISTRADOR)' })
  async updateScenarios(
    @CurrentUser() user: AuthUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: UpdateScenariosDto,
  ) {
    await this.access.require(user, 'manage', spaceId);
    return this.render(await this.simulator.update(spaceId, dto));
  }

  private render(config: SpaceScenarioConfig) {
    const scenarios = Object.fromEntries(
      Object.entries(SCENARIO_DESCRIPTIONS).map(([key, description]) => [
        key,
        {
          active: Boolean(config[key as keyof SpaceScenarioConfig]),
          description,
        },
      ]),
    );
    return { data: { spaceId: config.spaceId, scenarios } };
  }
}
