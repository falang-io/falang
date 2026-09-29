import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../../users/users/users.module.js';
import { PersonalAccessToken } from './personal-access-token.entity.js';
import { PersonalAccessTokensController } from './personal-access-tokens.controller.js';
import { PersonalAccessTokensService } from './personal-access-tokens.service.js';

/**
 * Exports `PersonalAccessTokensService` so `PatOrJwtAuthGuard` (in `../pat-or-jwt-auth.guard.ts`)
 * can use it once a route (`/mcp`, phase F) is guarded with it — see
 * ADR 0029 (private).
 */
@Module({
  imports: [TypeOrmModule.forFeature([PersonalAccessToken]), UsersModule],
  controllers: [PersonalAccessTokensController],
  providers: [PersonalAccessTokensService],
  exports: [PersonalAccessTokensService],
})
export class PersonalAccessTokensModule {}
