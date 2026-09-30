import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users/users.module.js';
import { AdminSupportController } from './admin-support.controller.js';
import { SupportMessage } from './support-message.entity.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

/** `SUPPORT_NOTIFIER` is deliberately not provided here — `SupportService` injects it `@Optional()`. */
@Module({
  imports: [TypeOrmModule.forFeature([SupportMessage]), UsersModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
