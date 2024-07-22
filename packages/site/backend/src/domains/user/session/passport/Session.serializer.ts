import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { PinoLogger } from 'nestjs-pino';
import { User } from '../../user/entites/User.entity';
import { UserService } from '../../user/services/User.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(
    private readonly users: UserService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SessionSerializer.name);
  }

  serializeUser(user: User, done: CallableFunction) {
    // console.log('serialize', { user });
    if (!user) {
      return done();
    }
    done(null, user.id.toString());
  }

  deserializeUser(userId: string, done: CallableFunction) {
    // console.log('deserialize', { userId });
    this.users
      .getById(parseInt(userId))
      .then((user) => {
        if (!user) {
          new InternalServerErrorException(`User #${userId} not found`);
        }
        // console.log('deserialized', { user });
        done(null, user);
      })
      .catch((err) => done(err));
  }
}
