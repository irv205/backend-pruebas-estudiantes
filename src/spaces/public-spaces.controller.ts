import { Controller, ForbiddenException, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SpaceType } from '@prisma/client';
import { SpacesService } from './spaces.service';

@ApiTags('public')
@Controller('public')
export class PublicSpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Post('sandboxes')
  @ApiOperation({
    summary: 'Crear un sandbox anónimo (sin login, con TTL y cuotas)',
    description:
      'Devuelve un spaceId de alta entropía. Úsalo como cabecera `x-space-id` en /api/v1/public/products. Los datos son temporales y desechables.',
  })
  async createSandbox() {
    const space = await this.spaces.createAnonymousSandbox();
    return {
      data: {
        spaceId: space.id,
        slug: space.slug,
        type: space.type,
        expiresAt: space.expiresAt,
        usage: 'Envía la cabecera x-space-id con el spaceId (o slug) en /api/v1/public/products.',
      },
    };
  }

  @Post('sandboxes/:spaceId/reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reiniciar un sandbox (o la demo pública) sin afectar otros espacios',
  })
  async resetSandbox(@Param('spaceId') spaceId: string) {
    const space = await this.spaces.resolvePublicSpace(spaceId);
    if (space.type !== SpaceType.SANDBOX && space.type !== SpaceType.DEMO) {
      throw new ForbiddenException({
        code: 'SPACE_REQUIRES_AUTH',
        message: 'Solo se pueden reiniciar sandboxes o la demo por la vía pública.',
      });
    }
    await this.spaces.resetSpace(space.id, undefined, space.type === 'DEMO' ? 'demo-reset' : 'sandbox-reset');
    return {
      data: {
        spaceId: space.id,
        message:
          space.type === SpaceType.DEMO
            ? 'Demo pública restaurada a sus datos iniciales.'
            : 'Sandbox reiniciado. Sus datos fueron eliminados.',
      },
    };
  }
}
