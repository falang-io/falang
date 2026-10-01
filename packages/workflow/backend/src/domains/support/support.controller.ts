import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
// oxlint-disable-next-line consistent-type-imports
import { ListSupportMessagesDto } from './dto/list-support-messages.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { SendSupportMessageDto } from './dto/send-support-message.dto.js';
import { SupportService } from './support.service.js';
import type { IApiSupportMessage } from './support.types.js';

/** The signed-in user's own support thread. */
@Controller('support')
export class SupportController {
  private readonly support: SupportService;

  constructor(@Inject(SupportService) support: SupportService) {
    this.support = support;
  }

  @Get('messages')
  list(@Query() query: ListSupportMessagesDto, @CurrentUser() user: IJwtPayloadUser): Promise<IApiSupportMessage[]> {
    return this.support.listMessages(user.id, query.after);
  }

  @Post('messages')
  send(@Body() body: SendSupportMessageDto, @CurrentUser() user: IJwtPayloadUser): Promise<IApiSupportMessage> {
    return this.support.send(user.id, 'user', user.id, body.text);
  }

  @Post('messages/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@CurrentUser() user: IJwtPayloadUser): Promise<void> {
    await this.support.markRead(user.id, 'admin');
  }

  @Get('unread')
  async unread(@CurrentUser() user: IJwtPayloadUser): Promise<{ count: number }> {
    return { count: await this.support.countUnreadForUser(user.id) };
  }
}
