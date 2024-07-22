import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../../user/services/User.service';
import { PinoLogger } from 'nestjs-pino';
import { User } from '../../user/entites/User.entity';

@Injectable()
export class SessionAuthStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(
    @Inject(forwardRef(() => UserService))
    private users: UserService,
    private logger: PinoLogger,
  ) {
    super({
      passReqToCallback: false,
    });
    this.logger.setContext(SessionAuthStrategy.name);
  }

  async validate(identity: string, password: string): Promise<User> {
    const user = await this.users.findByLoginCridentials({
      identity,
      password,
    });
    if (!user) {
      this.logger.debug(`Failed validation for itentity: ${identity}`);
      throw new UnauthorizedException();
    }
    this.logger.trace(`Succes validation for identity ${identity}`);
    return user;
  }
}
