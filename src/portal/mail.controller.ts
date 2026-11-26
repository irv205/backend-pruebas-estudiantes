import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { MailInboxService } from '../mail/mail-inbox.service';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mail')
export class MailController {
  constructor(private readonly inbox: MailInboxService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Correos de prueba propios (mediados por el backend; sin UI de Mailpit)',
    description:
      'Solo devuelve mensajes cuyo destinatario es el correo del usuario autenticado. ' +
      'No incluye cuerpos ni snippets para no exponer tokens de verificación/recuperación.',
  })
  async mine(@CurrentUser() user: AuthUser) {
    return this.inbox.listFor(user.email);
  }
}
