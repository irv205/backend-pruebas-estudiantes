import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join, resolve } from 'path';
import { StorageProvider } from './storage-provider';

/**
 * Almacenamiento local de desarrollo. Útil cuando MinIO no está activo o en
 * CI; el volumen `files_data` del contenedor conserva los objetos.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    const dir = config.get<string>('FILES_LOCAL_DIR') ?? './storage/uploads';
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  private pathFor(key: string): string {
    // El prefijo siempre empieza con `spaces/<uuid>/`, pero se valida de nuevo.
    if (key.includes('..') || key.startsWith('/')) throw new Error('INVALID_OBJECT_KEY');
    return join(this.root, key);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.pathFor(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }

  async presignedUrl(): Promise<null> {
    this.logger.debug('URLs prefirmadas desactivadas con almacenamiento local.');
    return null;
  }
}
