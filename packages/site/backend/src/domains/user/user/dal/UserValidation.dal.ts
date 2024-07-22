import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RegisterDto } from '../../registration/dto/Register.dto';
import { EMAIL_REGEXP, USERNAME_REGEXP } from '../constants';
import { User } from '../entites/User.entity';
import { normalizeEmail } from '../helpers/normalizeEmail';
import { normalizeUsername } from '../helpers/normalizeUsername';

@Injectable()
export class UserValidationDal {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  private getRepository(em?: EntityManager) {
    return em?.getRepository(User) ?? this.usersRepository;
  }

  async isEmailAvailable(email: string, em?: EntityManager): Promise<boolean> {
    const normalizedEmail = normalizeEmail(email);
    const repository = this.getRepository(em);
    const countUserWithEmail = await repository
      .createQueryBuilder()
      .where('email=:email', { email: normalizedEmail })
      .getCount();
    return countUserWithEmail === 0;
  }

  async isUsernameAvailable(
    username: string,
    em?: EntityManager,
  ): Promise<boolean> {
    const normalizedUsername = normalizeUsername(username);
    const repository = this.getRepository(em);
    const countUserWithUsername = await repository
      .createQueryBuilder()
      .where('username_unique=:username', { username: normalizedUsername })
      .getCount();
    return countUserWithUsername === 0;
  }

  async checkCanRegister(
    data: RegisterDto,
    em?: EntityManager,
  ): Promise<true | string> {
    if (!USERNAME_REGEXP.test(data.username)) return 'Wrong username';
    if (!EMAIL_REGEXP.test(data.email)) return 'Wrong email';
    if (!(await this.isUsernameAvailable(data.username, em)))
      return 'Username already registered';
    if (!(await this.isEmailAvailable(data.email, em))) {
      return 'Email already registered';
    }
    return true;
  }
}
