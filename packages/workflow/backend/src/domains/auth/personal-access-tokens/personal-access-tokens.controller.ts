import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/jwt.strategy.js';
// Kept as a value import (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from this parameter's runtime type metadata, so erasing the import
// would silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { CreatePersonalAccessTokenDto } from './dto/create-personal-access-token.dto.js';
import {
  PersonalAccessTokensService,
  type ICreatedPersonalAccessToken,
  type IPersonalAccessTokenSummary,
} from './personal-access-tokens.service.js';

/** Current user's own tokens only — see ADR 0029 (private)'s PAT decision (per-user, optional project scope). */
@Controller('auth/tokens')
export class PersonalAccessTokensController {
  private readonly tokensService: PersonalAccessTokensService;

  constructor(@Inject(PersonalAccessTokensService) tokensService: PersonalAccessTokensService) {
    this.tokensService = tokensService;
  }

  @Get()
  list(@CurrentUser() user: IJwtPayloadUser): Promise<IPersonalAccessTokenSummary[]> {
    return this.tokensService.list(user.id);
  }

  /** The only response that ever carries the raw token — never returned again afterward. */
  @Post()
  create(
    @CurrentUser() user: IJwtPayloadUser,
    @Body() body: CreatePersonalAccessTokenDto,
  ): Promise<ICreatedPersonalAccessToken> {
    return this.tokensService.create(user.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: IJwtPayloadUser, @Param('id') id: string): Promise<void> {
    await this.tokensService.revoke(user.id, id);
  }
}
