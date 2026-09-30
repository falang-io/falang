import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/auth/admin.guard.js';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
// oxlint-disable-next-line consistent-type-imports
import { ListSupportMessagesDto } from './dto/list-support-messages.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { SendSupportMessageDto } from './dto/send-support-message.dto.js';
import { SupportService } from './support.service.js';
import type { IApiSupportMessage, IApiSupportThread } from './support.types.js';

/** `/admin/support/*` — the administrator side of every user's support thread. */
@UseGuards(AdminGuard)
@Controller('admin/support')
export class AdminSupportController {
  private readonly support: SupportService;

  constructor(@Inject(SupportService) support: SupportService) {
    this.support = support;
  }

  @Get('threads')
  threads(): Promise<IApiSupportThread[]> {
    return this.support.listThreads();
  }

  @Get('threads/:userId/messages')
  messages(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListSupportMessagesDto,
  ): Promise<IApiSupportMessage[]> {
    return this.support.listMessages(userId, query.after);
  }

  @Post('threads/:userId/messages')
  reply(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SendSupportMessageDto,
    @CurrentUser() admin: IJwtPayloadUser,
  ): Promise<IApiSupportMessage> {
    return this.support.send(userId, 'admin', admin.id, body.text);
  }

  @Post('threads/:userId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.support.markRead(userId, 'user');
  }

  @Get('unread')
  async unread(): Promise<{ count: number }> {
    return { count: await this.support.countUnreadForAdmins() };
  }
}
