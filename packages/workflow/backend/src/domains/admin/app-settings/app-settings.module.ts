import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSettingsService } from './agent-settings.service.js';
import { AppSetting } from './app-setting.entity.js';
import { AppSettingsService } from './app-settings.service.js';

/**
 * Split out of `AdminModule` on purpose — see `AppSettingsService`'s own doc comment for why
 * (avoids an `AdminModule` ⇄ `AgentChatModule` import cycle, same reasoning `OAuthCredentialsModule`
 * already applies). See ADR 0031 (private).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  providers: [AppSettingsService, AgentSettingsService],
  exports: [AppSettingsService, AgentSettingsService],
})
export class AppSettingsModule {}
