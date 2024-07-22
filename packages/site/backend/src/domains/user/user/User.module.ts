import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../../system/mail/Mail.module';
import { ClientUserDal } from './dal/ClientUser.dal';
import { UserDal } from './dal/User.dal';
import { UserConfirmationDal } from './dal/UserConfirmation.dal';
import { UserValidationDal } from './dal/UserValidation.dal';
import { User } from './entites/User.entity';
import { UserConfirmCode } from './entites/UserConfirmCode.entity';
import { ClientUserService } from './services/ClientUser.service';
import { UserService } from './services/User.service';

@Module({
  imports: [MailModule, TypeOrmModule.forFeature([User, UserConfirmCode])],
  providers: [
    UserDal,
    UserValidationDal,
    UserService,
    ClientUserService,
    ClientUserDal,
    UserConfirmationDal,
  ],
  exports: [
    UserDal,
    UserValidationDal,
    UserService,
    ClientUserService,
    ClientUserDal,
  ],
})
export class UserModule {}
