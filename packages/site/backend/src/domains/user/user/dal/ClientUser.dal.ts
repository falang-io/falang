import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { User } from '../entites/User.entity';

export interface IClientUserInfo {
  username: string;
  email: string;
  isActive: boolean;
}

@Injectable()
export class ClientUserDal {
  constructor(
    @InjectEntityManager()
    private em: EntityManager,
  ) {}

  private getRepository(em?: EntityManager) {
    return (em ?? this.em).getRepository(User);
  }

  async getInfo(
    id: number,
    em?: EntityManager,
  ): Promise<IClientUserInfo | null> {
    const repo = this.getRepository(em);
    const user = await repo.findOneBy({ id });
    return user ?? null;
  }
}
