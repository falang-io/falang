import { Module } from '@nestjs/common';
import { LogModule } from '../../system/log/Log.module';
import { UserRegistrationModule } from '../registration/UserRegistration.module';
import { SessionModule } from '../session/Session.module';
import { UserModule } from '../user/User.module';
import { ProfileController } from './controllers/Profile.controller';
import { SessionController } from './controllers/Session.controller';
import { UserRegistrationController } from './controllers/UserRegistration.controller';

@Module({
  imports: [LogModule, UserRegistrationModule, SessionModule, UserModule],
  controllers: [
    UserRegistrationController,
    SessionController,
    ProfileController,
  ],
})
export class UserHttpApiModule {}
