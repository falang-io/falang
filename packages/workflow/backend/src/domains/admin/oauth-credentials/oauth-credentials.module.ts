import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthCredential } from './oauth-credential.entity.js';
import { OAuthCredentialsService } from './oauth-credentials.service.js';

/**
 * Split out of `AdminModule` on purpose — see `OAuthCredentialsService`'s own doc comment for why
 * (avoids an `AdminModule` ⇄ `IntegrationsModule` import cycle).
 */
@Module({
  imports: [TypeOrmModule.forFeature([OAuthCredential])],
  providers: [OAuthCredentialsService],
  exports: [OAuthCredentialsService],
})
export class OAuthCredentialsModule {}
