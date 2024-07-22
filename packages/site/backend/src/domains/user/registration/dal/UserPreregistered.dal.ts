import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { normalizeEmail } from '../../user/helpers/normalizeEmail';
import { UserPreregistered } from '../entities/UserPreregistered.entity';
import { v4 as uuidV4 } from 'uuid';
import { RegisterDto } from '../dto/Register.dto';

@Injectable()
export class UserPreregisteredDal {
  constructor(
    @InjectRepository(UserPreregistered)
    private preregistered: Repository<UserPreregistered>,
  ) {}

  private getRepository(em?: EntityManager): Repository<UserPreregistered> {
    return em?.getRepository(UserPreregistered) ?? this.preregistered;
  }

  getAll() {
    return this.getRepository().find();
  }

  async findActivePreregisteredByEmail(
    email: string,
    em?: EntityManager,
  ): Promise<UserPreregistered | null> {
    const repository = this.getRepository(em);
    const user = await repository.findOne({
      where: {
        email: normalizeEmail(email),
        finished: IsNull(),
      },
    });
    return user ?? null;
  }

  async create(
    data: RegisterDto,
    em?: EntityManager,
  ): Promise<UserPreregistered> {
    const repository = this.getRepository(em);
    await this.disableActivePreregisteredIfExists(data.email, false, em);

    let user = repository.create();
    user.email = normalizeEmail(data.email);
    user.username = data.username;
    user.code = `${uuidV4()}${uuidV4()}${uuidV4()}`.replace(/-/g, '');
    user.promo = '';
    user = await repository.save(user);

    return user;
  }

  async disableActivePreregisteredIfExists(
    email: string,
    success = false,
    em?: EntityManager,
  ) {
    const repository = this.getRepository(em);
    const activePreregistered = await this.findActivePreregisteredByEmail(
      email,
      em,
    );
    if (activePreregistered) {
      activePreregistered.finished = new Date();
      activePreregistered.success = success;
      await repository.save(activePreregistered);
    }
  }

  async findByCode(
    code: string,
    em?: EntityManager,
  ): Promise<UserPreregistered | null> {
    const repository = this.getRepository(em);
    const preregistered = await repository.findOneBy({
      code,
      finished: IsNull(),
    });
    return preregistered ?? null;
  }
}
