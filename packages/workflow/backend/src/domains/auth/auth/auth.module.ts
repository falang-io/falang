import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../../mail/mail.module.js';
import { UsersModule } from '../../users/users/users.module.js';
import { AuthTokensModule } from '../auth-tokens/auth-tokens.module.js';
import { CaptchaModule } from '../captcha/captcha.module.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

const ACCESS_TOKEN_EXPIRY = '7d';

@Module({
  imports: [
    UsersModule,
    MailModule,
    CaptchaModule,
    AuthTokensModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: ACCESS_TOKEN_EXPIRY },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountService, JwtStrategy],
})
export class AuthModule {}
