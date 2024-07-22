import { Injectable } from '@nestjs/common';
import { SessionData } from 'express-session';
import { PinoLogger } from 'nestjs-pino';
import { EntityManager } from 'typeorm';
import { SessionDal } from '../dal/Session.dal';
import { Session } from '../entities/Session.entity';

@Injectable()
export class SessionService {
  constructor(private sessions: SessionDal, private logger: PinoLogger) {
    this.logger.setContext(SessionService.name);
  }

  async set(id: string, data: SessionData) {
    this.logger.debug('set %s %o', id, data);
    return await this.sessions.set(id, data);
  }

  async get(id: string, em?: EntityManager): Promise<Session | null> {
    this.logger.debug('get %s', id);
    return await this.sessions.get(id, em);
  }

  async stop(id: string, em?: EntityManager) {
    this.logger.debug('stop %s', id);
    return await this.sessions.stop(id, em);
  }
}
