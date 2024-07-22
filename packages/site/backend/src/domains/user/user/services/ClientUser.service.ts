import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientUserDal, IClientUserInfo } from '../dal/ClientUser.dal';

@Injectable()
export class ClientUserService {
  constructor(private clients: ClientUserDal, private logger: PinoLogger) {
    this.logger.setContext(ClientUserService.name);
  }

  async getInfo(id: number): Promise<IClientUserInfo | null> {
    const result = await this.clients.getInfo(id);
    this.logger.debug('getInfo', { result });
    return result;
  }
}
