import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users/users.module.js';
import { AdminSupportController } from './admin-support.controller.js';
import { MailSupportNotifier } from './mail-support-notifier.js';
import { SupportMessage } from './support-message.entity.js';
import { SupportController } from './support.controller.js';
import { SUPPORT_NOTIFIER } from './support-notifier.js';
import { SupportService } from './support.service.js';

/** `SUPPORT_NOTIFIER` is the mail notifier (a no-op when mail isn't configured); an edition may override it. */
@Module({
  imports: [TypeOrmModule.forFeature([SupportMessage]), UsersModule, MailModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, MailSupportNotifier, { provide: SUPPORT_NOTIFIER, useExisting: MailSupportNotifier }],
})
export class SupportModule {}
