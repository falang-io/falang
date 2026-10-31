import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveJwtSecret } from '../../../config/validate-secrets.js';
import { AppSettingsModule } from '../../admin/app-settings/app-settings.module.js';
import { Project } from '../../projects/projects/project.entity.js';
import { AuthToken } from '../auth-tokens/auth-token.entity.js';
import { AuthMailEvent } from '../mail-limits/auth-mail-event.entity.js';
import { MailLimitsService } from '../mail-limits/mail-limits.service.js';
import { PersonalAccessTokensModule } from '../personal-access-tokens/personal-access-tokens.module.js';
import { AdminDigestService } from './admin-digest.service.js';
import { UnverifiedAccountGcService } from './unverified-account-gc.service.js';
import { MailModule } from '../../mail/mail.module.js';
import { UsersModule } from '../../users/users/users.module.js';
import { AuthTokensModule } from '../auth-tokens/auth-tokens.module.js';
import { CaptchaModule } from '../captcha/captcha.module.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { OAuthCredentialsModule } from '../../admin/oauth-credentials/oauth-credentials.module.js';

const ACCESS_TOKEN_EXPIRY = '7d';

@Module({
  imports: [
    UsersModule,
    OAuthCredentialsModule,
    MailModule,
    AppSettingsModule,
    PersonalAccessTokensModule,
    TypeOrmModule.forFeature([AuthMailEvent, AuthToken, Project]),
    CaptchaModule,
    AuthTokensModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config.get<string>('JWT_SECRET'), config.get<string>('NODE_ENV')),
        signOptions: { expiresIn: ACCESS_TOKEN_EXPIRY },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountService,
    JwtStrategy,
    MailLimitsService,
    AdminDigestService,
    UnverifiedAccountGcService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
