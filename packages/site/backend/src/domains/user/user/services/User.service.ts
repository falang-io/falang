import {
  BadRequestException,
  forwardRef,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as path from 'path';
import * as nunjucks from 'nunjucks';
import { EntityManager } from 'typeorm';

import {
  ILoginCridentials,
  IResetPasswordStartResult,
  UserDal,
} from '../dal/User.dal';
import {
  ChangePasswordDto,
  ResetPasswordDto,
  ResetPasswordFinishDto,
} from '../dto/User.dto';
import { User } from '../entites/User.entity';
import config from '../../../../config';
import { MailService } from '../../../system/mail';
import { ConfirmationDto } from '../dto/Confirmation.dto';
import { UserConfirmationDal } from '../dal/UserConfirmation.dal';

const changePasswordEmailPath = path.resolve(
  __dirname,
  '../email-templates/change_password_code.nunjucks',
);

export class UserService {
  constructor(
    private logger: PinoLogger,
    @Inject(forwardRef(() => UserDal))
    private userDal: UserDal,
    private mail: MailService,
    private confirmations: UserConfirmationDal,
  ) {
    this.logger.setContext(UserService.name);
  }

  async findByLoginCridentials(creds: ILoginCridentials): Promise<User | null> {
    return this.userDal.findByLoginCridentials(creds);
  }

  async getById(id: number, em?: EntityManager): Promise<User | null> {
    return this.userDal.getById(id, em);
  }

  async changePassword(dto: ChangePasswordDto, userId: number): Promise<void> {
    this.logger.debug('Changing password for user %s', userId);
    return this.userDal.changePassword(dto, userId);
  }

  async resetPasswordStart(dto: ResetPasswordDto): Promise<void> {
    this.logger.debug('Reseting password for %s', dto.email);
    const passResult = await this.userDal.resetPasswordStart(dto);
    if (!passResult)
      throw new BadRequestException(`User with email ${dto.email} not found`);
    await this.sendChangePasswordCode(passResult);
  }

  async resetPasswordFinish(dto: ResetPasswordFinishDto): Promise<void> {
    this.logger.debug(`Recived confirmation code: %s`, dto.code);
    const userId = await this.confirmations.confirm('reset-password', dto.code);
    if (!userId) {
      throw new BadRequestException('Wrong code');
    }
    const user = await this.getById(userId);
    if (!user) {
      throw new InternalServerErrorException(`User #${userId} not found`);
    }
    await this.userDal.setUserPassword(user, dto.newPassword);
  }

  async hasConfirmation(dto: ConfirmationDto): Promise<boolean> {
    const conf = await this.confirmations.findConfirmationByCode(
      'reset-password',
      dto.code,
    );
    return !!conf;
  }

  private async sendChangePasswordCode({
    user,
    code,
  }: IResetPasswordStartResult): Promise<void> {
    const body = nunjucks.render(changePasswordEmailPath, {
      username: user.username,
      link: `https://${config.PUBLIC_HOST}/reset-password-complete/${code}`,
    });

    await this.mail.send({
      to: user.email,
      subject: 'Reset password link',
      body,
    });
  }
}
