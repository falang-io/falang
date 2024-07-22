import { HttpException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as path from 'path';
import { MailService } from '../../../system/mail';
import { RegistrationDal } from '../dal/Registration.dal';
import { UserPreregistered } from '../entities/UserPreregistered.entity';
import * as nunjucks from 'nunjucks';
import config from '../../../../config';
import { User } from '../../user/entites/User.entity';
import { UserValidationDal } from '../../user/dal/UserValidation.dal';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { RegisterDto } from '../dto/Register.dto';

const activationEmailPath = path.resolve(
  __dirname,
  '../email-templates/activation_code.nunjucks',
);

const registeredEmailPath = path.resolve(
  __dirname,
  '../email-templates/registered.nunjucks',
);

export type TRegistrationResult =
  | { success: true }
  | { success: false; error: string };

@Injectable()
export class RegistrationService {
  constructor(
    @InjectEntityManager()
    private em: EntityManager,
    private dal: RegistrationDal,
    private userValidation: UserValidationDal,
    private mail: MailService,
    private logger: PinoLogger,
  ) {
    this.logger.setContext(RegistrationService.name);
  }

  async start(data: RegisterDto): Promise<TRegistrationResult> {
    this.logger.debug('Preregistration started', data);
    try {
      await this.em.transaction(async (em) => {
        const user = await this.dal.startRegister(data, em);
        await this.sendActivationLink(user);
        this.logger.debug('Preregistration finished', { user });
      });
      return { success: true };
    } catch (err) {
      if (err instanceof HttpException) {
        return {
          success: false,
          error: err.message,
        };
      }
      this.logger.error(err);
      throw err;
    }
  }

  private async sendActivationLink(preregisteredUser: UserPreregistered) {
    const body = nunjucks.render(activationEmailPath, {
      username: preregisteredUser.username,
      link: `https://${config.PUBLIC_HOST}/user/registration/activate/${preregisteredUser.code}`,
    });

    await this.mail.send({
      to: preregisteredUser.email,
      subject: 'Activation link',
      body,
    });
  }

  async finish(code: string) {
    this.logger.debug('Post registration started', { code });
    const { user, password } = await this.dal.finishRegister(code);
    await this.sendRegisteredEmail(user, password);
    this.logger.debug('Post registration finished', {
      user,
      code,
    });
  }

  private async sendRegisteredEmail(user: User, password: string) {
    const body = nunjucks.render(registeredEmailPath, {
      username: user.username,
      email: user.email,
      password,
    });

    await this.mail.send({
      to: user.email,
      subject: 'Registration successful',
      body,
    });
  }

  async isEmailAvailable(email: string) {
    this.logger.debug('isEmailAvailable', { email });
    return await this.userValidation.isEmailAvailable(email);
  }

  async isUsernameAvailable(username: string) {
    this.logger.debug('isUsernameAvailable', { username });
    return await this.userValidation.isUsernameAvailable(username);
  }
}
