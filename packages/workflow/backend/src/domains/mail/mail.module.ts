import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MAIL_TRANSPORT, MailService, type IMailTransport } from './mail.service.js';

/** Not `@Global()`: import it where mail is needed (`AuthModule`, `AdminModule`). */
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IMailTransport | null => {
        const url = config.get<string>('SMTP_URL', '').trim();
        return url ? createTransport(url) : null;
      },
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
