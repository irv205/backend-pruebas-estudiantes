import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpaceType } from '@prisma/client';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PublicUrlService } from '../common/public-url.service';
import { AuthUser } from '../common/types/auth-user';
import { DEMO_SPACE_SLUG } from '../database/demo-data';
import { PrismaService } from '../prisma/prisma.service';
import { PORTAL_CHALLENGES } from './challenges';
import { SCENARIO_DESCRIPTIONS } from '../simulator/scenarios';

/** Rutas reales reutilizadas por el portal (todas bajo /api/v1 salvo Swagger). */
export const PORTAL_ENDPOINTS = {
  manifest: '/api/v1/portal/manifest',
  spaces: '/api/v1/portal/spaces',
  guide: '/api/v1/portal/guide',
  collection: '/api/v1/portal/postman/collection',
  environment: '/api/v1/portal/postman/environment',
  webLogin: '/api/v1/auth/web/login',
  webRefresh: '/api/v1/auth/web/refresh',
  webLogout: '/api/v1/auth/web/logout',
  csrf: '/api/v1/auth/csrf',
  sandboxes: '/api/v1/public/sandboxes',
  teams: '/api/v1/spaces/teams',
  resetPersonal: '/api/v1/spaces/me/reset',
  resetTeam: '/api/v1/spaces/{spaceId}/reset',
  resetSandbox: '/api/v1/public/sandboxes/{spaceId}/reset',
  scenariosPersonal: '/api/v1/spaces/me/scenarios',
  scenariosTeam: '/api/v1/spaces/{spaceId}/scenarios',
  mail: '/api/v1/mail/me',
} as const;

const POSTMAN_FILES = {
  collection: 'backend-practicas.postman_collection.json',
  environment: 'backend-practicas.postman_environment.json',
} as const;

export type PostmanFileKind = keyof typeof POSTMAN_FILES;

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly publicUrls: PublicUrlService,
  ) {}

  /** Manifiesto público para el portal: URLs base, descargas, retos y escenarios. */
  manifest() {
    // URL vigente del túnel (archivo local) o fallback a PUBLIC_BASE_URL.
    const base = this.publicUrls.getBaseUrl();
    return {
      data: {
        // Campos nuevos: una sola raíz para que Postman derive el resto.
        baseUrl: base,
        tunnelUrl: base,
        wsBaseUrl: this.publicUrls.getWsBaseUrl(),
        apiBaseUrl: this.publicUrls.getApiBaseUrl(),
        swaggerUrl: `${base}/docs`,
        portalUrl: `${base}/portal`,
        healthUrls: [`${base}/health/live`, `${base}/health/ready`],
        demoSlug: this.config.get<string>('DEMO_SPACE_SLUG') ?? DEMO_SPACE_SLUG,
        endpoints: PORTAL_ENDPOINTS,
        downloads: {
          collection: `${base}${PORTAL_ENDPOINTS.collection}`,
          environment: `${base}${PORTAL_ENDPOINTS.environment}`,
          guide: `${base}${PORTAL_ENDPOINTS.guide}`,
        },
        scenarios: Object.entries(SCENARIO_DESCRIPTIONS).map(([key, description]) => ({
          key,
          description,
        })),
        challenges: PORTAL_CHALLENGES,
      },
    };
  }

  /**
   * Espacios que el usuario puede seleccionar: personal, equipos donde es
   * miembro y la demo pública (solo lectura). No crea ni modifica espacios.
   */
  async listSpaces(user: AuthUser) {
    const demoSlug = this.config.get<string>('DEMO_SPACE_SLUG') ?? DEMO_SPACE_SLUG;
    const [personal, memberships, demo] = await Promise.all([
      this.prisma.space.findFirst({
        where: { ownerId: user.id, type: SpaceType.PERSONAL },
      }),
      this.prisma.spaceMembership.findMany({
        where: { userId: user.id },
        include: { space: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.space.findUnique({ where: { slug: demoSlug } }),
    ]);

    const spaces: Array<{
      id: string;
      slug: string;
      type: string;
      name: string;
      role: string;
      readOnly: boolean;
      expiresAt: string | null;
    }> = [];

    if (personal) {
      spaces.push({
        id: personal.id,
        slug: personal.slug,
        type: personal.type,
        name: personal.name,
        role: 'ADMINISTRADOR',
        readOnly: false,
        expiresAt: null,
      });
    }
    for (const membership of memberships) {
      if (membership.space.type === SpaceType.PERSONAL) continue;
      spaces.push({
        id: membership.space.id,
        slug: membership.space.slug,
        type: membership.space.type,
        name: membership.space.name,
        role: membership.role,
        readOnly: false,
        expiresAt: membership.space.expiresAt?.toISOString() ?? null,
      });
    }
    if (demo) {
      spaces.push({
        id: demo.id,
        slug: demo.slug,
        type: demo.type,
        name: demo.name || 'Demo pública',
        role: 'PUBLIC',
        readOnly: true,
        expiresAt: null,
      });
    }
    return { data: { activeSpaceId: user.spaceId, spaces } };
  }

  /** Guía completa en Markdown; el portal muestra un resumen del manifiesto. */
  async guide(): Promise<string> {
    return readFile(join(process.cwd(), 'docs', 'coding-challenges.md'), 'utf8');
  }

  /** Descarga autorizada de un JSON de Postman (sin exponer el filesystem). */
  async postmanFile(kind: PostmanFileKind): Promise<{ content: string; fileName: string }> {
    const fileName = POSTMAN_FILES[kind];
    if (!fileName) {
      throw new NotFoundException({
        code: 'POSTMAN_FILE_NOT_FOUND',
        message: 'El archivo de Postman solicitado no existe.',
      });
    }
    const content = await readFile(join(process.cwd(), 'postman', fileName), 'utf8');
    return { content, fileName };
  }
}
