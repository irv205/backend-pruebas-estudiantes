import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Página del portal (HTML vanilla). Los assets se sirven desde
 * `/portal/assets/...` con express.static; esta ruta solo entrega el index.
 * Está fuera del prefijo `/api/v1` (ver `configureApp`).
 */
@ApiExcludeController()
@Controller('portal')
export class PortalPageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async index(): Promise<string> {
    return readFile(
      join(__dirname, '..', '..', 'public', 'portal', 'index.html'),
      'utf8',
    );
  }
}
