import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailInboxService } from '../mail/mail-inbox.service';
import { MailController } from './mail.controller';
import { PortalController } from './portal.controller';
import { PortalPageController } from './portal-page.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [AuthModule],
  controllers: [PortalController, PortalPageController, MailController],
  providers: [PortalService, MailInboxService],
  exports: [PortalService, MailInboxService],
})
export class PortalModule {}
