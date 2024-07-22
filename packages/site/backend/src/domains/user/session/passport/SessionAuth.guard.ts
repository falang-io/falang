import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SessionAuthGuard extends AuthGuard('session') {
  constructor(options = {}) {
    super({
      ...options,
      property: 'user1',
    });
  }
}
