import { Module } from '@nestjs/common';
import { LogModule } from '../log/Log.module';
import { MailService } from './Mail.service';

@Module({
  imports: [LogModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
