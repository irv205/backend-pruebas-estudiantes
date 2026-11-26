import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/**
 * Resuelve la URL pública vigente en CADA USO.
 *
 * Prioridad:
 *   1. `run/tunnel-url.txt` (o `PUBLIC_URL_FILE`): archivo local efímero que
 *      escribe el túnel de Cloudflare. Texto plano, una sola línea, raíz sin
 *      `/api/v1`. Se lee en cada llamada: al cambiar el túnel no hace falta
 *      editar `.env` ni reiniciar la app.
 *   2. `PUBLIC_BASE_URL`: fallback con el significado de siempre (raíz pública
 *      sin `/api/v1`; el servicio añade el sufijo donde corresponde).
 *
 * En `NODE_ENV=test` (o con `PUBLIC_URL_FILE_DISABLED=true`) el archivo se
 * ignora por completo para que un archivo local del anfitrión no altere e2e.
 */
@Injectable()
export class PublicUrlService {
  private readonly logger = new Logger(PublicUrlService.name);
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  /** Raíz pública, sin barra final ni `/api/v1`. */
  getBaseUrl(): string {
    return this.readTunnelUrl() ?? normalizeBase(this.config.getOrThrow<string>('PUBLIC_BASE_URL'));
  }

  /** Raíz de la API. El sufijo `/api/v1` sigue añadiéndose aquí. */
  getApiBaseUrl(): string {
    return `${this.getBaseUrl()}/api/v1`;
  }

  /** Raíz para Socket.IO (https → wss, http → ws). */
  getWsBaseUrl(): string {
    return this.getBaseUrl().replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  }

  private readTunnelUrl(): string | null {
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const disabled = this.config.get('PUBLIC_URL_FILE_DISABLED');
    if (
      nodeEnv === 'test'
      || disabled === true
      || disabled === 'true'
      || disabled === '1'
    ) {
      return null;
    }

    const configured = this.config.get<string>('PUBLIC_URL_FILE') || './run/tunnel-url.txt';
    const file = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch (error) {
      // ENOENT es el estado normal cuando no hay túnel: no ensuciamos los logs.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.warnOnce(`No se pudo leer ${file}; se usa PUBLIC_BASE_URL.`);
      }
      return null;
    }

    const candidate = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!candidate || !isValidRootUrl(candidate)) {
      this.warnOnce(`El archivo ${file} no contiene una URL pública válida; se usa PUBLIC_BASE_URL.`);
      return null;
    }
    return normalizeBase(candidate);
  }

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(message);
  }
}

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Acepta solo orígenes HTTP(S) en la raíz: sin credenciales, query, fragmento
 * ni ruta (por eso `/api/v1` queda descartado explícitamente).
 */
function isValidRootUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  const path = parsed.pathname.replace(/\/+$/, '');
  return path === '';
}
