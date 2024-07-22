import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from '../../system/database/Database.module';
import { UserModule } from '../user/User.module';
import { SessionDal } from './dal/Session.dal';
import { Session } from './entities/Session.entity';
import { LocalAuthGuard } from './passport/LocalAuth.guard';
import { SessionSerializer } from './passport/Session.serializer';
import { SessionAuthGuard } from './passport/SessionAuth.guard';
import { SessionAuthStrategy } from './passport/SessionAuth.strategy';
import { SessionService } from './services/Session.service';
import { SessionStore } from './Session.store';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'session',
      session: true,
      property: 'user1',
      userProperty: 'user1',
    }),
    DatabaseModule,
    UserModule,
    TypeOrmModule.forFeature([Session]),
  ],
  providers: [
    SessionService,
    SessionDal,
    SessionAuthStrategy,
    SessionAuthGuard,
    SessionStore,
    SessionSerializer,
    LocalAuthGuard,
  ],
  exports: [
    SessionService,
    SessionAuthStrategy,
    SessionStore,
    SessionAuthGuard,
    SessionStore,
    SessionSerializer,
    LocalAuthGuard,
  ],
})
export class SessionModule {}
