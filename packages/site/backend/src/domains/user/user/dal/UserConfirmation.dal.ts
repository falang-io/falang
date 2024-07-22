import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import moment from 'moment';
import { EntityManager } from 'typeorm';
import { BaseDal } from '../../../system/database/dal/Base.dal';
import { generateRandomString } from '../../../system/util/generateRandomString';
import { UserConfirmCode } from '../entites/UserConfirmCode.entity';

export interface IClientUserInfo {
  username: string;
  email: string;
  isActive: boolean;
}

export type TConfirmationType = 'reset-password';

@Injectable()
export class UserConfirmationDal extends BaseDal<UserConfirmCode> {
  constructor(
    @InjectEntityManager()
    em: EntityManager,
  ) {
    super({
      em,
      entity: UserConfirmCode,
    });
  }

  async createConfirmation(
    type: TConfirmationType,
    userId: number,
    em?: EntityManager,
  ): Promise<string> {
    const repo = this.getRepository(em);
    const currentConfirmation = await this.findConfirmationByUser(
      type,
      userId,
      em,
    );
    if (currentConfirmation) {
      await repo.remove(currentConfirmation);
    }
    const confirmation = repo.create();
    const code = generateRandomString(40);
    confirmation.code = code;
    confirmation.expires = moment().add(1, 'day').toDate();
    confirmation.userId = userId;
    confirmation.type = type;
    confirmation.userId = userId;
    await repo.save(confirmation);
    return code;
  }

  /**
   * @param type confirmation type
   * @param code confirmation code
   * @param em Entity manager
   * @returns userId || null
   */
  async confirm(
    type: TConfirmationType,
    code: string,
    em?: EntityManager,
  ): Promise<number | null> {
    const confirmation = await this.findConfirmationByCode(type, code, em);
    if (!confirmation) return null;
    const userId = confirmation.userId;
    await this.getRepository(em).remove(confirmation);
    return userId;
  }

  async findConfirmationByUser(
    type: TConfirmationType,
    userId: number | null,
    em?: EntityManager,
  ): Promise<UserConfirmCode | null> {
    const confirmation = await this.getRepository(em).findOneBy({
      type,
      userId: userId ?? undefined,
    });
    if (!confirmation) return null;
    if (confirmation.expires.getTime() > Date.now()) {
      await this.getRepository(em).remove(confirmation);
      return null;
    }
    return confirmation;
  }

  async findConfirmationByCode(
    type: TConfirmationType,
    code: string,
    em?: EntityManager,
  ): Promise<UserConfirmCode | null> {
    const confirmation = await this.getRepository(em).findOneBy({
      type,
      code,
    });
    if (!confirmation) return null;
    if (confirmation.expires.getTime() < Date.now()) {
      await this.getRepository(em).remove(confirmation);
      return null;
    }
    return confirmation;
  }
}
