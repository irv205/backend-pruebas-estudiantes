import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PublicUrlService } from './public-url.service';

describe('PublicUrlService', () => {
  let dir: string;
  let file: string;
  const fallback = 'http://localhost:3100';

  // El ConfigService real consulta process.env primero; en Jest NODE_ENV=test,
  // así que usamos un stub determinista para cada caso.
  const serviceWith = (extra: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      NODE_ENV: 'development',
      PUBLIC_BASE_URL: fallback,
      PUBLIC_URL_FILE: file,
      ...extra,
    };
    const config = {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => values[key],
    } as unknown as ConfigService;
    return new PublicUrlService(config);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'public-url-'));
    file = join(dir, 'tunnel-url.txt');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('usa el archivo válido y deriva las tres URLs', () => {
    writeFileSync(file, 'https://abc123.trycloudflare.com\n', 'utf8');
    const service = serviceWith();
    expect(service.getBaseUrl()).toBe('https://abc123.trycloudflare.com');
    expect(service.getApiBaseUrl()).toBe('https://abc123.trycloudflare.com/api/v1');
    expect(service.getWsBaseUrl()).toBe('wss://abc123.trycloudflare.com');
  });

  it('resuelve en cada uso: refleja cambios del túnel sin reconstruir el servicio', () => {
    const service = serviceWith();
    expect(service.getBaseUrl()).toBe(fallback);
    writeFileSync(file, 'https://primero.trycloudflare.com\n', 'utf8');
    expect(service.getBaseUrl()).toBe('https://primero.trycloudflare.com');
    writeFileSync(file, 'https://segundo.trycloudflare.com\n', 'utf8');
    expect(service.getBaseUrl()).toBe('https://segundo.trycloudflare.com');
    rmSync(file, { force: true });
    expect(service.getBaseUrl()).toBe(fallback);
  });

  it.each([
    'https://user:pass@abc.trycloudflare.com',
    'https://abc.trycloudflare.com/api/v1',
    'https://abc.trycloudflare.com/?token=1',
    'https://abc.trycloudflare.com/#tab',
    'ftp://abc.trycloudflare.com',
    'esto-no-es-una-url',
  ])('ignora contenido inválido (%s) y usa el fallback', (content) => {
    writeFileSync(file, `${content}\n`, 'utf8');
    const service = serviceWith();
    expect(service.getBaseUrl()).toBe(fallback);
    expect(service.getApiBaseUrl()).toBe(`${fallback}/api/v1`);
    expect(service.getWsBaseUrl()).toBe('ws://localhost:3100');
  });

  it('usa PUBLIC_BASE_URL tal cual cuando el archivo no existe', () => {
    const service = serviceWith({ PUBLIC_BASE_URL: 'https://local.example.com/' });
    expect(service.getBaseUrl()).toBe('https://local.example.com');
    expect(service.getApiBaseUrl()).toBe('https://local.example.com/api/v1');
    expect(service.getWsBaseUrl()).toBe('wss://local.example.com');
  });

  it('ignora el archivo en NODE_ENV=test', () => {
    writeFileSync(file, 'https://abc.trycloudflare.com\n', 'utf8');
    const service = serviceWith({ NODE_ENV: 'test' });
    expect(service.getBaseUrl()).toBe(fallback);
    expect(service.getApiBaseUrl()).toBe(`${fallback}/api/v1`);
  });

  it('ignora el archivo con PUBLIC_URL_FILE_DISABLED=true', () => {
    writeFileSync(file, 'https://abc.trycloudflare.com\n', 'utf8');
    const service = serviceWith({ PUBLIC_URL_FILE_DISABLED: true });
    expect(service.getBaseUrl()).toBe(fallback);
  });
});
