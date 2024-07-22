import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { BaseDal } from '../../../system/database/dal/Base.dal';
import { generateSalt } from '../../registration/util/generatePassword';
import { hashPassword } from '../../registration/util/hashPassword';
import { ChangePasswordDto, ResetPasswordDto } from '../dto/User.dto';
import { User } from '../entites/User.entity';
import { normalizeEmail } from '../helpers/normalizeEmail';
import { normalizeUsername } from '../helpers/normalizeUsername';
import { UserConfirmationDal } from './UserConfirmation.dal';

export interface ICreateUserParams {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  username: string;
}

export interface ILoginCridentials {
  identity: string;
  password: string;
}

export interface IResetPasswordStartResult {
  code: string;
  user: User;
}

@Injectable()
export class UserDal extends BaseDal<User> {
  constructor(
    @InjectEntityManager()
    em: EntityManager,
    private confirmations: UserConfirmationDal,
  ) {
    super({ em, entity: User });
  }

  async create(params: ICreateUserParams, em?: EntityManager): Promise<User> {
    const repository = this.getRepository(em);
    let user = repository.create();
    user.email = params.email;
    user.passwordHash = params.passwordHash;
    user.passwordSalt = params.passwordSalt;
    user.username = params.username;
    user.username_unique = normalizeUsername(params.username);
    user = await repository.save(user);
    return user;
  }

  async findByLoginCridentials(
    { identity, password }: ILoginCridentials,
    em?: EntityManager,
  ): Promise<User | null> {
    const isEmail = identity.includes('@');
    const user = await this.getRepository(em).findOneBy(
      isEmail
        ? { email: normalizeEmail(identity) }
        : { username_unique: normalizeUsername(identity) },
    );
    console.log(user, { identity, password, isEmail });
    if (!user || !this.checkPasswordForUser(user, password)) return null;
    return user;
  }

  private checkPasswordForUser(user: User, password: string) {
    const hashedPassword = hashPassword(password, user.passwordSalt);
    console.log({ hashedPassword, password });
    return user.passwordHash === hashedPassword;
  }

  async setUserPassword(
    user: User,
    newPassword: string,
    em?: EntityManager,
  ): Promise<void> {
    const passwordSalt = generateSalt();
    const passwordHash = hashPassword(newPassword, passwordSalt);
    await this.getRepository(em).update(
      { id: user.id },
      { passwordHash, passwordSalt },
    );
  }

  async changePassword(
    { newPassword, oldPassword }: ChangePasswordDto,
    userId: number,
    em?: EntityManager,
  ) {
    if (newPassword === oldPassword) {
      throw new BadRequestException('Password not changed');
    }
    const user = await this.getById(userId, em);
    if (!user) {
      throw new InternalServerErrorException(`User #${userId} not found`);
    }
    if (!this.checkPasswordForUser(user, oldPassword)) {
      throw new BadRequestException('Wrong old password');
    }
    await this.setUserPassword(user, newPassword, em);
  }

  async getByEmail(email: string, em?: EntityManager): Promise<User | null> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.getRepository(em).findOneBy({
      email: normalizedEmail,
    });
    return user ?? null;
  }

  async resetPasswordStart({
    email,
  }: ResetPasswordDto): Promise<IResetPasswordStartResult | null> {
    return this.transaction(undefined, (em) => {
      return this._resetPasswordStart(email, em);
    });
  }

  private async _resetPasswordStart(
    email: string,
    em: EntityManager,
  ): Promise<IResetPasswordStartResult | null> {
    const user = await this.getByEmail(email, em);
    if (!user) return null;
    const code = await this.confirmations.createConfirmation(
      'reset-password',
      user.id,
      em,
    );
    return { user, code };
  }
}
