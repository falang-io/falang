import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import moment from 'moment';
import { Session } from '../entities/Session.entity';
import { SessionData } from 'express-session';

@Injectable()
export class SessionDal {
  constructor(
    @InjectEntityManager()
    private em: EntityManager,
  ) {}

  private getRepository(em?: EntityManager) {
    return (em ?? this.em).getRepository(Session);
  }

  async create(
    id: string,
    data: SessionData,
    em?: EntityManager,
  ): Promise<Session> {
    const repo = this.getRepository(em);
    const session = repo.create();
    session.id = id;
    session.expires = this.getNextExpires();
    session.setSessionData(data);
    return await repo.save(session);
  }

  async get(id: string, em?: EntityManager): Promise<Session | null> {
    const repo = this.getRepository(em);
    const session = await repo.findOneBy({ id });
    return session || null;
  }

  async set(
    id: string,
    data: SessionData,
    em?: EntityManager,
  ): Promise<Session> {
    const repo = this.getRepository(em);
    let session = await repo.findOneBy({ id });
    if (!session) {
      session = await this.create(id, data, em);
    } else {
      session.setSessionData(data);
      session = await repo.save(session);
    }
    session.expires = this.getNextExpires();
    return session;
  }

  async stop(id: string, em?: EntityManager) {
    const repo = this.getRepository(em);
    await repo.delete({ id });
  }

  private getNextExpires(): Date {
    return moment().add(30, 'days').toDate();
  }

  async setUserId(
    sessionId: string,
    userId: number,
    em?: EntityManager,
  ): Promise<Session> {
    const session = await this.get(sessionId, em);

    if (!session) {
      throw new InternalServerErrorException(`Session not found: ${sessionId}`);
    }

    return await this.getRepository(em).save(session);
  }
}
