import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserPreregistered } from '../entities/UserPreregistered.entity';
import { generatePassword } from '../util/generatePassword';
import { UserPreregisteredDal } from './UserPreregistered.dal';
import { UserValidationDal } from '../../user/dal/UserValidation.dal';
import { UserDal } from '../../user/dal/User.dal';
import { InjectEntityManager } from '@nestjs/typeorm';
import { User } from '../../user/entites/User.entity';
import { RegisterDto } from '../dto/Register.dto';

export interface IRegistrationResult {
  user: User;
  password: string;
}

@Injectable()
export class RegistrationDal {
  constructor(
    @InjectEntityManager()
    private em: EntityManager,
    private user: UserDal,
    private userValidation: UserValidationDal,
    private preregistered: UserPreregisteredDal,
  ) {}

  async startRegister(
    data: RegisterDto,
    em?: EntityManager,
  ): Promise<UserPreregistered> {
    if (em) return await this._startRegister(data, em);
    return await this.em.transaction(async (em) => {
      return await this._startRegister(data, em);
    });
  }

  private async _startRegister(
    data: RegisterDto,
    em: EntityManager,
  ): Promise<UserPreregistered> {
    const canRegisterResult = await this.userValidation.checkCanRegister(
      data,
      em,
    );
    if (canRegisterResult !== true) {
      throw new BadRequestException(canRegisterResult);
    }
    const user = await this.preregistered.create(data, em);
    return user;
  }

  async finishRegister(
    code: string,
    em?: EntityManager,
  ): Promise<IRegistrationResult> {
    if (em) return await this._finishRegister(code, em);
    return await this.em.transaction(async (em) => {
      return await this._finishRegister(code, em);
    });
  }

  private async _finishRegister(
    code: string,
    em: EntityManager,
  ): Promise<IRegistrationResult> {
    const preregistered = await this.preregistered.findByCode(code, em);
    if (!preregistered) {
      throw new BadRequestException(
        'Wrong code. Please try to register again.',
      );
    }

    const passwordData = generatePassword();

    const user = await this.user.create(
      {
        username: preregistered.username,
        email: preregistered.email,
        passwordHash: passwordData.hash,
        passwordSalt: passwordData.salt,
      },
      em,
    );

    await this.preregistered.disableActivePreregisteredIfExists(
      user.email,
      true,
      em,
    );

    return { user, password: passwordData.password };
  }
}
