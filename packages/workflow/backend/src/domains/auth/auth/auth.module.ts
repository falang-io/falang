import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { resolveJwtSecret } from '../../../config/validate-secrets.js';
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
  providers: [AuthService, AccountService, JwtStrategy],
})
export class AuthModule {}
