import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthToken } from './auth-token.entity.js';
import { AuthTokensService } from './auth-tokens.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuthToken])],
  providers: [AuthTokensService],
  exports: [AuthTokensService],
})
export class AuthTokensModule {}
