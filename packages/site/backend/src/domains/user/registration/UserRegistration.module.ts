import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../../system/mail/Mail.module';
import { UserModule } from '../user/User.module';
import { RegistrationDal } from './dal/Registration.dal';
import { UserPreregisteredDal } from './dal/UserPreregistered.dal';
import { UserPreregistered } from './entities/UserPreregistered.entity';
import { RegistrationService } from './services/Registration.service';

@Module({
  imports: [
    MailModule,
    UserModule,
    TypeOrmModule.forFeature([UserPreregistered]),
  ],
  providers: [RegistrationService, UserPreregisteredDal, RegistrationDal],
  exports: [RegistrationService, UserPreregisteredDal, RegistrationDal],
})
export class UserRegistrationModule {}
